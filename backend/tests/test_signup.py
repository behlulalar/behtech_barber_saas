"""Kendi kayıt (onay bekliyor) + KVKK onay kayıtları."""
from sqlalchemy import func, select, text, update

from app.core.database import SessionFactory
from app.models.consent_record import ConsentRecord
from app.models.subscription import Subscription
from app.models.tenant import Tenant
from tests.factories import *  # noqa
from tests.helpers import *  # noqa

BODY = {
    "name": "Yeni Berber", "slug": "yeniberber", "owner_name": "Ali", "owner_surname": "Veli",
    "owner_phone": "5553334455", "password": "gizli-sifre-1", "accept_terms": True,
}


async def test_signup_requires_terms(api):
    r = await api.post("/api/public/signup", json={**BODY, "accept_terms": False})
    assert r.status_code == 400


async def test_signup_creates_pending_inactive_tenant_with_consent(api):
    r = await api.post("/api/public/signup", json=BODY)
    assert r.status_code == 201
    async with SessionFactory() as db:
        t = (await db.execute(select(Tenant).where(Tenant.slug == "yeniberber"))).scalar_one()
        assert t.signup_status == "pending" and t.is_active is False
        consents = (await db.execute(select(ConsentRecord).where(ConsentRecord.tenant_id == t.id))).scalars().all()
        assert [c.kind for c in consents] == ["tenant_terms"]
    # Onaylanana kadar giriş ve site kapalı, mesaj başvuruyu söyler
    r = await api.get("/api/public/tenant", slug="yeniberber")
    assert r.status_code == 403 and "inceleniyor" in r.json()["detail"]


async def test_signup_rejects_duplicates_and_bad_input(api):
    assert (await api.post("/api/public/signup", json=BODY)).status_code == 201
    assert (await api.post("/api/public/signup", json={**BODY, "owner_phone": "5553334466"})).status_code == 409  # slug
    assert (await api.post("/api/public/signup", json={**BODY, "slug": "baska"})).status_code == 409  # telefon
    assert (await api.post("/api/public/signup", json={**BODY, "slug": "www", "owner_phone": "5553334477"})).status_code == 400
    assert (await api.post("/api/public/signup", json={**BODY, "slug": "zayif", "owner_phone": "5553334488", "password": "12345678"})).status_code == 422


async def test_signup_ip_limit(api):
    for i in range(5):
        r = await api.post("/api/public/signup", json={**BODY, "slug": f"dukkan{i}", "owner_phone": f"555333441{i}"})
        assert r.status_code == 201
    r = await api.post("/api/public/signup", json={**BODY, "slug": "dukkan9", "owner_phone": "5553334499"})
    assert r.status_code == 429


async def test_platform_approve_starts_trial_and_opens_site(api):
    tok = mint_platform_token(await make_platform_admin())
    await api.post("/api/public/signup", json=BODY)
    async with SessionFactory() as db:
        tid = (await db.execute(select(Tenant.id).where(Tenant.slug == "yeniberber"))).scalar_one()
    pending = (await api.get("/api/platform/tenants?status=pending", token=tok)).json()
    assert [x["id"] for x in pending["items"]] == [tid]
    # Elle aktifleştirme başvuruyu atlayamaz
    assert (await api.patch(f"/api/platform/tenants/{tid}", token=tok, json={"is_active": True})).status_code == 409
    r = await api.post(f"/api/platform/tenants/{tid}/signup/approve", token=tok)
    assert r.status_code == 200 and r.json()["is_active"] is True and r.json()["signup_status"] == "approved"
    async with SessionFactory() as db:
        subs = (await db.execute(select(Subscription).where(Subscription.tenant_id == tid))).scalars().all()
        assert len(subs) == 1 and subs[0].is_trial
    assert (await api.get("/api/public/tenant", slug="yeniberber")).status_code == 200
    # İkinci onay: artık beklemiyor
    assert (await api.post(f"/api/platform/tenants/{tid}/signup/approve", token=tok)).status_code == 409


async def test_platform_reject_keeps_closed(api):
    tok = mint_platform_token(await make_platform_admin())
    await api.post("/api/public/signup", json=BODY)
    async with SessionFactory() as db:
        tid = (await db.execute(select(Tenant.id).where(Tenant.slug == "yeniberber"))).scalar_one()
    r = await api.post(f"/api/platform/tenants/{tid}/signup/reject", token=tok)
    assert r.status_code == 200 and r.json()["signup_status"] == "rejected"
    assert (await api.get("/api/public/tenant", slug="yeniberber")).status_code == 403


async def test_signup_endpoints_need_platform_token(api):
    assert (await api.post("/api/platform/tenants/1/signup/approve")).status_code == 401


async def test_customer_consent_required_then_remembered(api):
    await make_shop("alfa")
    body = {"phone": "5551234567"}
    r = await api.post("/api/auth/send-code", slug="alfa", json=body)
    assert r.status_code == 400 and "aydınlatma" in r.json()["detail"]
    assert (await api.post("/api/auth/send-code", slug="alfa", json={**body, "kvkk_accepted": True})).status_code == 200
    async with SessionFactory() as db:
        rows = (await db.execute(select(ConsentRecord).where(ConsentRecord.kind == "customer_privacy"))).scalars().all()
        assert len(rows) == 1 and rows[0].phone == "5551234567"
    # Aynı sürüm daha önce onaylandı: kutu işaretlenmese de geçer ve kayıt çoğalmaz
    from app.models.verification_code import VerificationCode
    async with SessionFactory() as db:  # 60 sn aralığı kuralını atla
        await db.execute(update(VerificationCode).values(created_at=func.now() - text("interval '2 minutes'")))
        await db.commit()
    assert (await api.post("/api/auth/send-code", slug="alfa", json=body)).status_code == 200
    async with SessionFactory() as db:
        assert len((await db.execute(select(ConsentRecord).where(ConsentRecord.kind == "customer_privacy"))).scalars().all()) == 1
