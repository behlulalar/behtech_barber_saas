"""Destek girişi ("İşletme olarak gir"): tek kullanımlık kod, salt görüntüleme, audit."""
import hashlib
from datetime import datetime, timedelta

import jwt
from sqlalchemy import select, update

from app.core.config import settings
from app.core.database import SessionFactory
from app.models.audit_log import AuditLog
from app.models.impersonation_code import ImpersonationCode
from app.models.platform_admin import PlatformAdmin
from tests.factories import *  # noqa
from tests.helpers import *  # noqa

BAD = "Destek bağlantısı geçersiz veya süresi dolmuş"


async def start(api, admin, tenant_id, **body):
    tok = mint_platform_token(admin)
    return await api.post(f"/api/platform/tenants/{tenant_id}/impersonate", token=tok, json=body)


async def enter(api, admin, shop, slug=None, **body):
    r = await start(api, admin, shop.tenant.id, **body)
    assert r.status_code == 200, r.text
    ex = await api.post("/api/auth/impersonate", slug=slug or shop.slug, json={"code": r.json()["code"]})
    assert ex.status_code == 200, ex.text
    return ex.json()["access_token"]


async def audits(action):
    async with SessionFactory() as db:
        return (await db.execute(select(AuditLog).where(AuditLog.action == action).order_by(AuditLog.id))).scalars().all()


async def test_start_returns_code_and_stores_only_hash(api, platform_admin, shop):
    r = await start(api, platform_admin, shop.tenant.id)
    body = r.json()
    assert r.status_code == 200 and body["slug"] == "alfa" and body["expires_in"] == 60 and len(body["code"]) >= 32
    async with SessionFactory() as db:
        row = (await db.execute(select(ImpersonationCode))).scalar_one()
    assert row.code_hash == hashlib.sha256(body["code"].encode()).hexdigest()
    assert body["code"] not in (row.code_hash, str(row.__dict__))
    assert row.staff_id == shop.owner.id and row.read_only is False
    (a,) = await audits("impersonation.start")
    assert a.actor_type == "platform_admin" and a.tenant_id == shop.tenant.id
    assert a.details == {"staff_id": shop.owner.id, "read_only": False}
    assert body["code"] not in a.summary


async def test_start_requires_platform_token_and_active_tenant_and_own_staff(api, platform_admin, shop, shop2):
    assert (await api.post(f"/api/platform/tenants/{shop.tenant.id}/impersonate", json={})).status_code == 401
    assert (await api.post(f"/api/platform/tenants/{shop.tenant.id}/impersonate", token=shop.owner_token, json={})).status_code == 401
    r = await start(api, platform_admin, shop.tenant.id, staff_id=shop2.owner.id)
    assert r.status_code == 404
    async with SessionFactory() as db:
        t = await db.get(Tenant, shop.tenant.id)
        t.is_active = False
        await db.commit()
    r = await start(api, platform_admin, shop.tenant.id)
    assert r.status_code == 400 and r.json()["detail"] == "İşletme pasif; önce aktifleştirin"


async def test_code_is_single_use(api, platform_admin, shop):
    code = (await start(api, platform_admin, shop.tenant.id)).json()["code"]
    r1 = await api.post("/api/auth/impersonate", slug="alfa", json={"code": code})
    r2 = await api.post("/api/auth/impersonate", slug="alfa", json={"code": code})
    assert r1.status_code == 200 and r2.status_code == 400 and r2.json()["detail"] == BAD


async def test_code_expires(api, platform_admin, shop):
    code = (await start(api, platform_admin, shop.tenant.id)).json()["code"]
    async with SessionFactory() as db:
        await db.execute(update(ImpersonationCode).values(expires_at=datetime.now() - timedelta(seconds=1)))
        await db.commit()
    r = await api.post("/api/auth/impersonate", slug="alfa", json={"code": code})
    assert r.status_code == 400 and r.json()["detail"] == BAD


async def test_code_wrong_host_tenant(api, platform_admin, shop, shop2):
    code = (await start(api, platform_admin, shop.tenant.id)).json()["code"]
    r = await api.post("/api/auth/impersonate", slug="beta", json={"code": code})
    assert r.status_code == 400 and r.json()["detail"] == BAD
    ok = await api.post("/api/auth/impersonate", slug="alfa", json={"code": code})
    assert ok.status_code == 200


async def test_invalid_code_400_then_throttled(api, platform_admin, shop):
    for _ in range(settings.login_max_failures - 1):
        r = await api.post("/api/auth/impersonate", slug="alfa", json={"code": "x" * 43})
        assert r.status_code == 400 and r.json()["detail"] == BAD
    r = await api.post("/api/auth/impersonate", slug="alfa", json={"code": "x" * 43})
    assert r.status_code == 429
    # kilitliyken geçerli kod bile reddedilir
    code = (await start(api, platform_admin, shop.tenant.id)).json()["code"]
    assert (await api.post("/api/auth/impersonate", slug="alfa", json={"code": code})).status_code == 429


async def test_token_carries_imp_and_ro_claims_and_60_min(api, platform_admin, shop):
    tok = await enter(api, platform_admin, shop, read_only=True)
    p = jwt.decode(tok, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    assert p["imp"] == platform_admin.id and p["ro"] is True and p["sub"] == str(shop.owner.id)
    left = p["exp"] - datetime.now().timestamp()
    assert 3500 < left <= 3600


async def test_read_only_blocks_writes_but_allows_reads(api, platform_admin, shop):
    tok = await enter(api, platform_admin, shop, read_only=True)
    assert (await api.get("/api/admin/services", slug="alfa", token=tok)).status_code == 200
    msg = "Destek modu salt görüntüleme: değişiklik yapılamaz"
    r = await api.post("/api/admin/services", slug="alfa", token=tok, json={"name": "Yeni", "price": 10, "duration_min": 30})
    assert r.status_code == 403 and r.json()["detail"] == msg
    sid = shop.cut.id
    assert (await api.patch(f"/api/admin/services/{sid}", slug="alfa", token=tok, json={"price": 5})).status_code == 403
    assert (await api.delete(f"/api/admin/services/{sid}", slug="alfa", token=tok)).status_code == 403
    assert await audits("impersonation.action") == []  # engellenen istek iz bırakmaz (işlem olmadı)


async def test_full_mode_allows_writes_and_audits_without_body(api, platform_admin, shop):
    tok = await enter(api, platform_admin, shop)
    r = await api.post("/api/admin/services", slug="alfa", token=tok,
                       json={"name": "Gizli Hizmet Adi", "price": 10, "duration_min": 30})
    assert r.status_code == 201
    (a,) = await audits("impersonation.action")
    assert a.actor_type == "platform_admin" and a.actor_id == platform_admin.id and a.tenant_id == shop.tenant.id
    assert a.summary == "Destek modunda: POST /api/admin/services"
    assert "Gizli" not in a.summary and "Gizli" not in str(a.details)
    await api.get("/api/admin/services", slug="alfa", token=tok)
    assert len(await audits("impersonation.action")) == 1  # GET denetlenmez


async def test_me_shows_impersonation_and_normal_login_does_not(api, platform_admin, shop):
    tok = await enter(api, platform_admin, shop, read_only=True)
    me = (await api.get("/api/auth/me", slug="alfa", token=tok)).json()
    assert me["impersonated_by"]["id"] == platform_admin.id and me["impersonated_by"]["phone"] == PLATFORM_PHONE
    assert me["read_only"] is True and me["id"] == shop.owner.id
    normal = (await api.get("/api/auth/me", slug="alfa", token=shop.owner_token)).json()
    assert normal["impersonated_by"] is None and normal["read_only"] is False


async def test_end_is_audited_with_duration_even_in_read_only(api, platform_admin, shop):
    tok = await enter(api, platform_admin, shop, read_only=True)
    r = await api.post("/api/auth/impersonate/end", slug="alfa", token=tok)
    assert r.status_code == 204  # salt görüntülemede bile oturum bitirilebilmeli
    (a,) = await audits("impersonation.end")
    assert a.actor_type == "platform_admin" and a.details["duration_seconds"] >= 0
    # normal oturum bitiremez
    assert (await api.post("/api/auth/impersonate/end", slug="alfa", token=shop.owner_token)).status_code == 400


async def test_deactivated_admin_session_drops(api, platform_admin, shop):
    tok = await enter(api, platform_admin, shop)
    async with SessionFactory() as db:
        a = await db.get(PlatformAdmin, platform_admin.id)
        a.is_active = False
        await db.commit()
    assert (await api.get("/api/auth/me", slug="alfa", token=tok)).status_code == 401


async def test_audit_catalog_has_support_group(api, platform_admin):
    r = await api.get("/api/platform/audit/actions", token=mint_platform_token(platform_admin))
    d = {x["value"]: x for x in r.json()}
    assert d["impersonation.start"]["label"] == "Destek girişi başlatıldı" and d["impersonation.start"]["group"] == "Destek"
    assert d["impersonation.end"]["label"] == "Destek girişi bitti"
    assert d["impersonation.action"]["label"] == "Destek modunda işlem"
