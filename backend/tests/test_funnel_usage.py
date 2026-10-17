"""Dönüşüm hunisi ve işletme kullanım sayıları."""
from datetime import date, datetime, timedelta

from sqlalchemy import update

from app.core.database import SessionFactory
from app.models.message_log import MessageLog
from app.models.payment import Payment
from app.models.tenant import Tenant
from tests.factories import *  # noqa
from tests.helpers import *  # noqa


async def test_funnel_counts_each_step(api, platform_admin, shop, shop2):
    tok = mint_platform_token(platform_admin)
    pending = await make_tenant("bekleyen", "Bekleyen", active=False)
    async with SessionFactory() as db:
        await db.execute(update(Tenant).where(Tenant.id == pending.id).values(signup_status="pending"))
        await db.execute(update(Tenant).where(Tenant.id.in_([shop.tenant.id, shop2.tenant.id])).values(signup_status="approved"))
        await db.commit()
    # shop: kurulum tamam (factory'de hizmet+berber+saat var) + randevu + ödeme; shop2: sadece kurulum
    c = await make_customer(shop.tenant.id, "5321110000")
    await make_appointment(shop.tenant.id, c.id, shop.staff.id, shop.cut.id, tomorrow(), time(11, 0))
    async with SessionFactory() as db:
        db.add(Payment(tenant_id=shop.tenant.id, amount=1000, paid_on=date.today()))
        await db.commit()
    r = await api.get("/api/platform/funnel", token=tok)
    assert r.status_code == 200, r.text
    steps = {s["key"]: s for s in r.json()["steps"]}
    assert steps["signup"]["count"] == 3 and steps["approved"]["count"] == 2
    assert steps["ready"]["count"] >= 1 and steps["booking"]["count"] == 1 and steps["paid"]["count"] == 1
    assert steps["approved"]["pct_of_first"] == 67 and steps["signup"]["pct_of_prev"] is None
    assert (await api.get("/api/platform/funnel", token=shop.owner_token)).status_code == 401


async def test_usage_counts_last_30_days(api, platform_admin, shop):
    c = await make_customer(shop.tenant.id, "5321110000")
    await make_appointment(shop.tenant.id, c.id, shop.staff.id, shop.cut.id, tomorrow(), time(11, 0))
    await make_appointment(shop.tenant.id, c.id, shop.staff.id, shop.cut.id, tomorrow(), time(12, 0))
    async with SessionFactory() as db:
        db.add(MessageLog(tenant_id=shop.tenant.id, kind="confirm", ok=True))
        db.add(MessageLog(tenant_id=shop.tenant.id, kind="confirm", ok=False))  # başarısız sayılmaz
        db.add(MessageLog(tenant_id=shop.tenant.id, kind="confirm", ok=True, created_at=datetime.now() - timedelta(days=40)))  # eski
        await db.commit()
    d = (await api.get(f"/api/platform/tenants/{shop.tenant.id}", token=mint_platform_token(platform_admin))).json()
    assert d["bookings_30d"] == 2 and d["messages_30d"] == 1
