"""Para tutarlılığı: silme sonrası yeniden hesaplama, ödeme doğrulamaları, yinelenen paket adı."""
from datetime import date, datetime, timedelta

from sqlalchemy import select

from app.core.database import SessionFactory
from app.models.audit_log import AuditLog
from app.models.subscription import Subscription
from app.models.tenant import Tenant
from tests.factories import *  # noqa
from tests.helpers import *  # noqa

TODAY = date.today()
D = timedelta


async def add_sub(tenant_id, start, end, price=1000):
    async with SessionFactory() as db:
        s = Subscription(tenant_id=tenant_id, plan_name="Aylık", start_date=start, end_date=end, price=price)
        db.add(s)
        await db.commit()
        return s


async def suspend(tenant_id):
    async with SessionFactory() as db:
        t = await db.get(Tenant, tenant_id)
        t.is_active, t.auto_suspended_at = False, datetime.now()
        await db.commit()


async def tenant(tenant_id):
    async with SessionFactory() as db:
        return await db.get(Tenant, tenant_id)


async def audit_actions():
    async with SessionFactory() as db:
        return [a for (a,) in (await db.execute(select(AuditLog.action).order_by(AuditLog.id))).all()]


async def test_suspended_tenant_reopens_when_covering_period_and_payment_added(api, platform_admin, shop):
    t = mint_platform_token(platform_admin)
    await add_sub(shop.tenant.id, TODAY - D(days=90), TODAY - D(days=60))
    await suspend(shop.tenant.id)
    r = await api.post(f"/api/platform/tenants/{shop.tenant.id}/subscriptions", token=t, json={
        "start_date": TODAY.isoformat(), "end_date": (TODAY + D(days=29)).isoformat(), "price": 900,
        "plan_name": "Yeni", "initial_payment": {"amount": 900, "paid_on": TODAY.isoformat()}})
    assert r.status_code == 201 and r.json()["payment_status"] == "paid"
    ten = await tenant(shop.tenant.id)
    assert ten.is_active and ten.auto_suspended_at is None
    assert "billing.auto_reactivate" in await audit_actions()


async def test_deleting_payment_recomputes_and_resuspends_when_coverage_gone(api, platform_admin, shop):
    """Kapsama kalkarsa tekrar askıya alınır: açık dönem silinince ve geriye yalnızca süresi dolmuş dönem kalınca."""
    t = mint_platform_token(platform_admin)
    old = await add_sub(shop.tenant.id, TODAY - D(days=90), TODAY - D(days=60))
    await suspend(shop.tenant.id)
    cur = (await api.post(f"/api/platform/tenants/{shop.tenant.id}/subscriptions", token=t, json={
        "start_date": TODAY.isoformat(), "end_date": (TODAY + D(days=29)).isoformat(), "price": 900,
        "plan_name": "Yeni", "initial_payment": {"amount": 900, "paid_on": TODAY.isoformat()}})).json()
    assert (await tenant(shop.tenant.id)).is_active
    # ödemeyi sil: dönem hâlâ kapsıyor (durum tarihle belirlenir) -> açık kalır
    pay = (await api.get(f"/api/platform/payments?tenant_id={shop.tenant.id}", token=t)).json()[0]
    assert (await api.delete(f"/api/platform/payments/{pay['id']}", token=t)).status_code == 204
    assert (await tenant(shop.tenant.id)).is_active
    # dönemi sil: kapsama kalktı, geriye 60 gün önce bitmiş dönem -> askıya alınır
    assert (await api.delete(f"/api/platform/subscriptions/{cur['id']}", token=t)).status_code == 204
    ten = await tenant(shop.tenant.id)
    assert ten.is_active is False and ten.auto_suspended_at is not None
    acts = await audit_actions()
    assert acts.count("billing.auto_suspend") == 1 and "payment.delete" in acts and "subscription.delete" in acts


async def test_deleting_subscription_leaves_tenant_untracked_and_open(api, platform_admin, shop):
    t = mint_platform_token(platform_admin)
    s = await add_sub(shop.tenant.id, TODAY - D(days=5), TODAY + D(days=25))
    assert (await api.delete(f"/api/platform/subscriptions/{s.id}", token=t)).status_code == 204
    assert (await tenant(shop.tenant.id)).is_active  # dönemi kalmayan işletme asla askıya alınmaz


async def test_deleting_expired_period_does_not_touch_manually_deactivated_tenant(api, platform_admin, shop):
    t = mint_platform_token(platform_admin)
    s = await add_sub(shop.tenant.id, TODAY - D(days=90), TODAY - D(days=60))
    await api.patch(f"/api/platform/tenants/{shop.tenant.id}", token=t, json={"is_active": False})
    await api.delete(f"/api/platform/subscriptions/{s.id}", token=t)
    ten = await tenant(shop.tenant.id)
    assert ten.is_active is False and ten.auto_suspended_at is None


async def test_deleting_one_of_two_periods_resuspends_if_remaining_expired(api, platform_admin, shop):
    """Aktif tenant, süresi dolmuş + güncel dönem: güncel dönem silinince askıya alınır (silme sonrası kural)."""
    t = mint_platform_token(platform_admin)
    await add_sub(shop.tenant.id, TODAY - D(days=100), TODAY - D(days=70))
    cur = await add_sub(shop.tenant.id, TODAY - D(days=69), TODAY + D(days=20))
    assert (await api.delete(f"/api/platform/subscriptions/{cur.id}", token=t)).status_code == 204
    ten = await tenant(shop.tenant.id)
    assert ten.is_active is False and ten.auto_suspended_at is not None


async def test_payment_deletion_and_audit_in_same_transaction_404(api, platform_admin):
    t = mint_platform_token(platform_admin)
    assert (await api.delete("/api/platform/payments/9999", token=t)).status_code == 404
    assert (await api.delete("/api/platform/subscriptions/9999", token=t)).status_code == 404
    assert await audit_actions() == []


async def test_payment_in_future_rejected(api, platform_admin, shop):
    t = mint_platform_token(platform_admin)
    r = await api.post("/api/platform/payments", token=t, json={
        "tenant_id": shop.tenant.id, "amount": 100, "paid_on": (TODAY + D(days=1)).isoformat()})
    assert r.status_code == 400 and "gelecekte" in r.json()["detail"]
    ok = await api.post("/api/platform/payments", token=t, json={
        "tenant_id": shop.tenant.id, "amount": 100, "paid_on": TODAY.isoformat()})
    assert ok.status_code == 201


async def test_payment_amount_upper_bound(api, platform_admin, shop):
    t = mint_platform_token(platform_admin)
    body = {"tenant_id": shop.tenant.id, "paid_on": TODAY.isoformat()}
    assert (await api.post("/api/platform/payments", token=t, json={**body, "amount": 10_000_001})).status_code == 400
    assert (await api.post("/api/platform/payments", token=t, json={**body, "amount": 10_000_000})).status_code == 201


async def test_overpayment_allowed(api, platform_admin, shop):
    t = mint_platform_token(platform_admin)
    s = await add_sub(shop.tenant.id, TODAY, TODAY + D(days=29), price=500)
    r = await api.post("/api/platform/payments", token=t, json={
        "tenant_id": shop.tenant.id, "subscription_id": s.id, "amount": 900, "paid_on": TODAY.isoformat()})
    assert r.status_code == 201


async def test_duplicate_plan_name_409_on_create_and_update(api, platform_admin):
    t = mint_platform_token(platform_admin)
    a = (await api.post("/api/platform/plans", token=t, json={"name": "Aylık", "duration_months": 1, "price": 900})).json()
    b = (await api.post("/api/platform/plans", token=t, json={"name": "Yıllık", "duration_months": 12, "price": 9000})).json()
    r = await api.post("/api/platform/plans", token=t, json={"name": "Aylık", "duration_months": 3, "price": 1})
    assert r.status_code == 409 and "paket zaten var" in r.json()["detail"]
    r = await api.post("/api/platform/plans", token=t, json={"name": "  Aylık ", "duration_months": 3, "price": 1})
    assert r.status_code == 409
    r = await api.patch(f"/api/platform/plans/{b['id']}", token=t, json={"name": "Aylık"})
    assert r.status_code == 409
    # başarısız güncelleme sonrası oturum bozulmadı, değerler aynı
    plans = {p["id"]: p for p in (await api.get("/api/platform/plans", token=t)).json()}
    assert plans[b["id"]]["name"] == "Yıllık" and plans[a["id"]]["name"] == "Aylık"
    # kendi adını tekrar göndermek sorun değil
    assert (await api.patch(f"/api/platform/plans/{a['id']}", token=t, json={"name": "Aylık", "price": 950})).status_code == 200
    assert await audit_actions() == ["plan.create", "plan.create", "plan.update"]
