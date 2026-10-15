"""Personel/sahip şifre özellikleri: şifre değiştirme, tüm cihazlardan çıkış, şifremi unuttum, kod iletimi."""
import httpx
import pytest
from sqlalchemy import select, update

from app.core.config import settings
from app.core.database import SessionFactory
from app.models.verification_code import VerificationCode
from app.services import otp_delivery, whatsapp_services
from tests.factories import *  # noqa
from tests.helpers import *  # noqa
from tests.test_impersonation import enter

NEW = "yeni-sifre-42"


async def login(api, shop, phone, password):
    return await api.post("/api/auth/login", slug=shop.slug, json={"phone": phone, "password": password})


# ------------------------------------------------------------------ şifre değiştirme
async def test_change_password_new_token_old_dies(api, shop):
    old = shop.staff_token
    r = await api.post("/api/auth/me/password", slug="alfa", token=old,
                       json={"current_password": PASSWORD, "new_password": NEW})
    assert r.status_code == 200, r.text
    new = r.json()["access_token"]
    assert (await api.get("/api/auth/me", slug="alfa", token=new)).status_code == 200
    assert (await api.get("/api/auth/me", slug="alfa", token=old)).status_code == 401
    assert (await login(api, shop, shop.staff.phone, NEW)).status_code == 200
    assert (await login(api, shop, shop.staff.phone, PASSWORD)).status_code == 401


async def test_change_password_wrong_current_and_policy(api, shop):
    tok = shop.staff_token
    r = await api.post("/api/auth/me/password", slug="alfa", token=tok,
                       json={"current_password": "yanlis", "new_password": NEW})
    assert r.status_code == 400 and r.json()["detail"] == "Mevcut şifre hatalı"
    for weak, msg in (("kisa123", "en az 8"), (shop.staff.phone, "telefon"), ("password", "yaygın"), ("12345678", "yaygın")):
        r = await api.post("/api/auth/me/password", slug="alfa", token=tok,
                           json={"current_password": PASSWORD, "new_password": weak})
        assert r.status_code == 422 and msg in r.json()["detail"], (weak, r.text)


async def test_change_password_blocked_in_support_mode(api, platform_admin, shop):
    tok = await enter(api, platform_admin, shop, read_only=False)
    r = await api.post("/api/auth/me/password", slug="alfa", token=tok,
                       json={"current_password": PASSWORD, "new_password": NEW})
    assert r.status_code == 403 and "Destek modunda" in r.json()["detail"]
    r = await api.post("/api/auth/me/logout-all", slug="alfa", token=tok)
    assert r.status_code == 403
    # gerçek hesap etkilenmedi
    assert (await login(api, shop, shop.owner.phone, PASSWORD)).status_code == 200


async def test_logout_all_kills_tokens(api, shop):
    tok = shop.owner_token
    assert (await api.post("/api/auth/me/logout-all", slug="alfa", token=tok)).status_code == 204
    assert (await api.get("/api/auth/me", slug="alfa", token=tok)).status_code == 401
    assert (await login(api, shop, shop.owner.phone, PASSWORD)).status_code == 200


# ------------------------------------------------------------------ şifremi unuttum
async def forgot(api, phone, slug="alfa"):
    return await api.post("/api/auth/forgot/send-code", slug=slug, json={"phone": phone})


async def reset(api, phone, code, pw=NEW, slug="alfa"):
    return await api.post("/api/auth/forgot/reset", slug=slug, json={"phone": phone, "code": code, "new_password": pw})


async def test_forgot_flow_end_to_end(api, shop):
    r = await forgot(api, shop.staff.phone)
    assert r.status_code == 200 and r.json()["message"] == "Numara kayıtlıysa doğrulama kodu gönderildi"
    code = r.json()["dev_code"]
    assert code and len(code) == 6
    old = shop.staff_token
    assert (await reset(api, shop.staff.phone, code)).status_code == 204
    assert (await login(api, shop, shop.staff.phone, NEW)).status_code == 200
    assert (await api.get("/api/auth/me", slug="alfa", token=old)).status_code == 401
    # kod tek kullanımlık
    assert (await reset(api, shop.staff.phone, code, pw="baska-sifre-9")).status_code == 400


async def test_forgot_no_enumeration(api, shop):
    ok = await forgot(api, shop.staff.phone)
    ghost = await forgot(api, "5559998877")
    assert ok.status_code == ghost.status_code == 200
    assert ok.json()["message"] == ghost.json()["message"]
    assert ok.json()["dev_code"] and ghost.json()["dev_code"] is None
    # kayıtsız numara için gelen kod yine de sıfırlayamaz
    async with SessionFactory() as db:
        code = (await db.execute(select(VerificationCode.code).where(VerificationCode.phone == "5559998877"))).scalar_one()
    assert (await reset(api, "5559998877", code)).status_code == 400


async def test_forgot_inactive_staff_gets_no_code(api, shop):
    r = await api.patch(f"/api/admin/staff/{shop.staff.id}", slug="alfa", token=shop.owner_token, json={"is_active": False})
    assert r.status_code == 200
    r = await forgot(api, shop.staff.phone)
    assert r.status_code == 200 and r.json()["dev_code"] is None


async def test_forgot_throttles_same_as_otp(api, shop):
    assert (await forgot(api, shop.staff.phone)).status_code == 200
    assert (await forgot(api, shop.staff.phone)).status_code == 429  # 60 sn aralık
    # login amaçlı kod bu sayacı etkilemez
    assert (await api.post("/api/auth/send-code", slug="alfa", json={"phone": shop.staff.phone, "kvkk_accepted": True})).status_code == 200
    # ghost numara da aynı sınırlara tabi (sızıntı yok)
    assert (await forgot(api, "5559998877")).status_code == 200
    assert (await forgot(api, "5559998877")).status_code == 429


async def test_purposes_are_not_interchangeable(api, shop):
    phone = shop.staff.phone
    login_code = (await api.post("/api/auth/send-code", slug="alfa", json={"phone": phone, "kvkk_accepted": True})).json()["dev_code"]
    reset_code = (await forgot(api, phone)).json()["dev_code"]
    # giriş kodu ile sıfırlama olmaz
    if login_code != reset_code:
        assert (await reset(api, phone, login_code)).status_code == 400
    # sıfırlama kodu ile müşteri doğrulaması olmaz
    r = await api.post("/api/auth/verify-code", slug="alfa", json={"phone": phone, "code": reset_code})
    if login_code != reset_code:
        assert r.status_code == 400
    assert (await reset(api, phone, reset_code)).status_code == 204


async def test_reset_five_wrong_attempts_invalidate_code(api, shop):
    phone = shop.staff.phone
    code = (await forgot(api, phone)).json()["dev_code"]
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        assert (await reset(api, phone, wrong)).status_code in (400, 429)
    r = await reset(api, phone, code)
    assert r.status_code in (400, 429)  # kod yandı (ya da kilit)
    assert (await login(api, shop, phone, PASSWORD)).status_code in (200, 429)


async def test_reset_weak_password_does_not_burn_code(api, shop):
    phone = shop.staff.phone
    code = (await forgot(api, phone)).json()["dev_code"]
    r = await reset(api, phone, code, pw="123")
    assert r.status_code == 422
    assert (await reset(api, phone, code)).status_code == 204


async def test_forgot_is_tenant_scoped(api, shop, shop2):
    code = (await forgot(api, shop.staff.phone)).json()["dev_code"]
    # aynı telefon başka dükkânda kayıtlı değilse o dükkânda sıfırlanamaz
    assert (await reset(api, shop.staff.phone, code, slug="beta")).status_code == 400


# ------------------------------------------------------------------ kod iletimi
async def test_deliver_noop_in_development(monkeypatch):
    calls = []
    monkeypatch.setattr(whatsapp_services, "send_whatsapp_message", lambda *a: calls.append(a))
    async with SessionFactory() as db:
        await otp_delivery.deliver_code(db, None, "otp", "5551234567", "x")
    assert calls == []


def _mock_client(monkeypatch, handler):
    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(whatsapp_services, "_client", lambda: httpx.AsyncClient(transport=transport))


async def test_deliver_posts_to_evolution_in_production(monkeypatch):
    seen = {}

    def handler(request: httpx.Request):
        seen["url"], seen["key"], seen["body"] = str(request.url), request.headers["apikey"], request.content.decode()
        return httpx.Response(201, json={"ok": True})

    _mock_client(monkeypatch, handler)
    monkeypatch.setattr(settings, "environment", "production")
    async with SessionFactory() as db:
        await otp_delivery.deliver_code(db, None, "otp", "5551234567", "kod 123456")
    assert seen["url"].endswith(f"/message/sendText/{settings.evolution_instance_name}")
    assert seen["key"] == settings.evolution_api_key
    assert '"number":"905551234567"' in seen["body"].replace(" ", "") and "kod 123456" in seen["body"]


@pytest.mark.parametrize("failure", ["status", "network"])
async def test_deliver_failure_is_503(monkeypatch, failure):
    def handler(request):
        if failure == "network":
            raise httpx.ConnectError("down")
        return httpx.Response(500)

    _mock_client(monkeypatch, handler)
    monkeypatch.setattr(settings, "environment", "production")
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as e:
        async with SessionFactory() as db:
            await otp_delivery.deliver_code(db, None, "otp", "5551234567", "x")
    assert e.value.status_code == 503 and e.value.detail == otp_delivery.DELIVERY_FAILED


async def test_customer_send_code_uses_delivery_and_503s(api, shop, monkeypatch):
    sent = []

    async def ok(db, tenant_id, kind, phone, text):
        sent.append((phone, text))

    monkeypatch.setattr("app.api.public.deliver_code", ok)
    monkeypatch.setattr(settings, "environment", "production")
    r = await api.post("/api/auth/send-code", slug="alfa", json={"phone": "5551234567", "kvkk_accepted": True})
    assert r.status_code == 200 and r.json()["dev_code"] is None  # üretimde kod yanıtta dönmez
    assert len(sent) == 1 and "5551234567" == sent[0][0]

    async def boom(db, tenant_id, kind, phone, text):
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail=otp_delivery.DELIVERY_FAILED)

    monkeypatch.setattr("app.api.public.deliver_code", boom)
    r = await api.post("/api/auth/send-code", slug="alfa", json={"phone": "5551234568", "kvkk_accepted": True})
    assert r.status_code == 503


async def test_forgot_delivers_only_for_existing_staff(api, shop, monkeypatch):
    sent = []

    async def ok(db, tenant_id, kind, phone, text):
        sent.append(phone)

    monkeypatch.setattr("app.api.admin.deliver_code", ok)
    await forgot(api, shop.staff.phone)
    await forgot(api, "5559998877")
    assert sent == [shop.staff.phone]
