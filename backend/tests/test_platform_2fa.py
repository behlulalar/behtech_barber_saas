"""Platform yöneticileri için 2FA (TOTP + yedek kodlar)."""
import time as _time

from sqlalchemy import select

from app.core import totp
from app.core.config import settings
from app.core.database import SessionFactory
from app.models.platform_admin import PlatformAdmin
from tests.factories import *  # noqa
from tests.helpers import *  # noqa


async def login(api, admin_phone=PLATFORM_PHONE, password=PLATFORM_PASSWORD):
    return await api.post("/api/platform/login", json={"phone": admin_phone, "password": password})


async def enable_2fa(api, admin) -> tuple[str, list[str], str]:
    """2FA'yı kurar; (gizli anahtar, yedek kodlar, tam yetkili token) döner."""
    tok = mint_platform_token(admin)
    r = await api.post("/api/platform/2fa/setup", token=tok, json={"password": PLATFORM_PASSWORD})
    assert r.status_code == 200, r.text
    secret = r.json()["secret"]
    r = await api.post("/api/platform/2fa/confirm", token=tok, json={"code": totp.code_at(secret)})
    assert r.status_code == 200, r.text
    return secret, r.json()["backup_codes"], r.json()["access_token"]


async def fresh_code(secret: str) -> str:
    """Aynı 30 sn'lik adımda ikinci kez kullanılamaz (tekrar oynatma koruması); bir sonraki adımın kodunu üret."""
    return totp.code_at(secret, _time.time() + totp.STEP)


async def test_setup_returns_secret_qr_and_uri_and_requires_password(api, platform_admin):
    tok = mint_platform_token(platform_admin)
    assert (await api.post("/api/platform/2fa/setup", token=tok, json={"password": "yanlis"})).status_code == 400
    r = (await api.post("/api/platform/2fa/setup", token=tok, json={"password": PLATFORM_PASSWORD})).json()
    assert r["otpauth_uri"].startswith("otpauth://totp/") and r["secret"] in r["otpauth_uri"]
    assert r["qr"].startswith("data:image/svg+xml;base64,")
    import base64
    import xml.dom.minidom
    svg = base64.b64decode(r["qr"].split(",", 1)[1]).decode()
    assert 'xmlns="http://www.w3.org/2000/svg"' in svg  # <img> olarak yüklenebilmesi için şart
    xml.dom.minidom.parseString(svg)  # geçerli XML
    st = (await api.get("/api/platform/2fa", token=tok)).json()
    assert st["enabled"] is False  # kod doğrulanana kadar AÇIK değil


async def test_secret_is_stored_encrypted(api, platform_admin):
    tok = mint_platform_token(platform_admin)
    secret = (await api.post("/api/platform/2fa/setup", token=tok, json={"password": PLATFORM_PASSWORD})).json()["secret"]
    async with SessionFactory() as db:
        stored = (await db.execute(select(PlatformAdmin.totp_secret))).scalar_one()
    assert secret not in stored and totp.decrypt_secret(stored) == secret


async def test_confirm_needs_valid_code_and_gives_10_backup_codes(api, platform_admin):
    tok = mint_platform_token(platform_admin)
    secret = (await api.post("/api/platform/2fa/setup", token=tok, json={"password": PLATFORM_PASSWORD})).json()["secret"]
    assert (await api.post("/api/platform/2fa/confirm", token=tok, json={"code": "000000"})).status_code == 400
    r = await api.post("/api/platform/2fa/confirm", token=tok, json={"code": totp.code_at(secret)})
    codes = r.json()["backup_codes"]
    assert len(codes) == 10 and len(set(codes)) == 10
    assert (await api.get("/api/platform/2fa", token=tok)).json() == {"enabled": True, "required": False, "backup_codes_remaining": 10}
    assert (await api.post("/api/platform/2fa/setup", token=tok, json={"password": PLATFORM_PASSWORD})).status_code == 409


async def test_login_with_2fa_gives_no_session_until_code(api, platform_admin):
    secret, _, _ = await enable_2fa(api, platform_admin)
    r = (await login(api)).json()
    assert r["mfa_required"] is True and r["access_token"] is None and r["mfa_token"]
    # kod olmadan ya da yanlış kodla oturum yok
    assert (await api.post("/api/platform/login/mfa", json={"mfa_token": r["mfa_token"], "code": "123456"})).status_code == 401
    ok = await api.post("/api/platform/login/mfa", json={"mfa_token": r["mfa_token"], "code": await fresh_code(secret)})
    assert ok.status_code == 200 and ok.json()["access_token"]
    assert (await api.get("/api/platform/tenants", token=ok.json()["access_token"])).status_code == 200


async def test_mfa_token_alone_is_not_a_session(api, platform_admin):
    await enable_2fa(api, platform_admin)
    mfa = (await login(api)).json()["mfa_token"]
    assert (await api.get("/api/platform/tenants", token=mfa)).status_code == 401
    assert (await api.post("/api/platform/login/mfa", json={"mfa_token": "bozuk", "code": "123456"})).status_code == 401


async def test_totp_code_cannot_be_replayed(api, platform_admin):
    secret, _, _ = await enable_2fa(api, platform_admin)
    code = await fresh_code(secret)
    m1 = (await login(api)).json()["mfa_token"]
    assert (await api.post("/api/platform/login/mfa", json={"mfa_token": m1, "code": code})).status_code == 200
    m2 = (await login(api)).json()["mfa_token"]
    assert (await api.post("/api/platform/login/mfa", json={"mfa_token": m2, "code": code})).status_code == 401  # aynı kod ikinci kez geçmez


async def test_backup_code_works_once(api, platform_admin):
    _, codes, _ = await enable_2fa(api, platform_admin)
    m = (await login(api)).json()["mfa_token"]
    assert (await api.post("/api/platform/login/mfa", json={"mfa_token": m, "code": codes[0]})).status_code == 200
    m = (await login(api)).json()["mfa_token"]
    assert (await api.post("/api/platform/login/mfa", json={"mfa_token": m, "code": codes[0]})).status_code == 401
    tok = mint_platform_token(platform_admin)
    assert (await api.get("/api/platform/2fa", token=tok)).json()["backup_codes_remaining"] == 9
    # biçim toleransı: büyük harf / tire / boşluk
    m = (await login(api)).json()["mfa_token"]
    assert (await api.post("/api/platform/login/mfa", json={"mfa_token": m, "code": f" {codes[1][:5].upper()}-{codes[1][5:].upper()} "})).status_code == 200


async def test_wrong_codes_lock_the_account(api, platform_admin):
    await enable_2fa(api, platform_admin)
    m = (await login(api)).json()["mfa_token"]
    for _ in range(4):
        assert (await api.post("/api/platform/login/mfa", json={"mfa_token": m, "code": "111111"})).status_code == 401
    assert (await api.post("/api/platform/login/mfa", json={"mfa_token": m, "code": "111111"})).status_code == 429


async def test_disable_needs_password_and_code(api, platform_admin):
    secret, _, tok = await enable_2fa(api, platform_admin)
    assert (await api.post("/api/platform/2fa/disable", token=tok, json={"password": "yanlis", "code": await fresh_code(secret)})).status_code == 400
    assert (await api.post("/api/platform/2fa/disable", token=tok, json={"password": PLATFORM_PASSWORD, "code": "000000"})).status_code == 400
    assert (await api.post("/api/platform/2fa/disable", token=tok,
                           json={"password": PLATFORM_PASSWORD, "code": await fresh_code(secret)})).status_code == 204
    assert (await login(api)).json()["access_token"]  # artık doğrudan giriş


async def test_regenerate_backup_codes_invalidates_old(api, platform_admin):
    secret, old, tok = await enable_2fa(api, platform_admin)
    r = await api.post("/api/platform/2fa/backup-codes", token=tok, json={"password": PLATFORM_PASSWORD, "code": await fresh_code(secret)})
    new = r.json()["backup_codes"]
    assert len(new) == 10 and not set(new) & set(old)
    m = (await login(api)).json()["mfa_token"]
    assert (await api.post("/api/platform/login/mfa", json={"mfa_token": m, "code": old[0]})).status_code == 401


async def test_other_admin_can_reset_but_not_yourself(api, platform_admin):
    other = await make_platform_admin(phone="5000000077", password="baska-sifre-9")
    secret, _, _ = await enable_2fa(api, platform_admin)
    tok_other = mint_platform_token(other)
    r = await api.post(f"/api/platform/admins/{platform_admin.id}/reset-2fa", token=tok_other)
    assert r.status_code == 204
    assert (await login(api)).json()["access_token"]  # 2FA kalktı
    assert (await api.post(f"/api/platform/admins/{other.id}/reset-2fa", token=tok_other)).status_code == 400
    assert (await api.post(f"/api/platform/admins/{other.id}/reset-2fa")).status_code == 401


async def test_required_mode_gives_setup_only_session_then_full(api, platform_admin, monkeypatch):
    monkeypatch.setattr(settings, "platform_2fa_required", True)
    r = (await login(api)).json()
    assert r["mfa_setup_required"] is True and r["access_token"]
    limited = r["access_token"]
    me = (await api.get("/api/platform/me", token=limited)).json()
    assert me["mfa_setup_required"] is True
    # kısıtlı oturum başka hiçbir yönetim ucunu açmaz
    for path in ("/api/platform/tenants", "/api/platform/stats", "/api/platform/admins"):
        assert (await api.get(path, token=limited)).status_code == 403
    setup = (await api.post("/api/platform/2fa/setup", token=limited, json={"password": PLATFORM_PASSWORD})).json()
    done = (await api.post("/api/platform/2fa/confirm", token=limited, json={"code": totp.code_at(setup["secret"])})).json()
    assert (await api.get("/api/platform/tenants", token=done["access_token"])).status_code == 200
    # zorunluyken kapatılamaz
    assert (await api.post("/api/platform/2fa/disable", token=done["access_token"],
                           json={"password": PLATFORM_PASSWORD, "code": await fresh_code(setup["secret"])})).status_code == 400


async def test_default_required_only_in_production(monkeypatch):
    from app.services import platform_2fa_services as t
    monkeypatch.setattr(settings, "platform_2fa_required", None)
    monkeypatch.setattr(settings, "environment", "development")
    assert t.required() is False
    monkeypatch.setattr(settings, "environment", "production")
    assert t.required() is True


def test_rfc6238_vector():
    import base64
    sec = base64.b32encode(b"12345678901234567890").decode()
    assert totp.code_at(sec, 59) == "287082" and totp.code_at(sec, 1111111109) == "081804"
