"""İşletme son etkinliği: son giriş ve son randevu; uzun süre sessiz kalan faturalı işletme aksiyon kuyruğunda."""
from datetime import date, datetime, timedelta

from sqlalchemy import update

from app.core.database import SessionFactory
from app.models.appointment import Appointment
from app.models.staff import Staff
from app.models.subscription import Subscription
from tests.factories import *  # noqa
from tests.helpers import *  # noqa

TODAY = date.today()


async def test_login_sets_last_login_and_platform_shows_activity(api, platform_admin, shop):
    tok = mint_platform_token(platform_admin)
    d = (await api.get(f"/api/platform/tenants/{shop.tenant.id}", token=tok)).json()
    assert d["last_login_at"] is None and d["last_booking_at"] is None
    r = await api.post("/api/auth/login", slug=shop.slug, json={"phone": shop.owner.phone, "password": PASSWORD})
    assert r.status_code == 200, r.text
    c = await make_customer(shop.tenant.id, "5321110000")
    await make_appointment(shop.tenant.id, c.id, shop.staff.id, shop.cut.id, tomorrow(), time(11, 0))
    d = (await api.get(f"/api/platform/tenants/{shop.tenant.id}", token=tok)).json()
    assert d["last_login_at"] is not None and d["last_booking_at"] is not None
    lst = (await api.get("/api/platform/tenants?limit=50", token=tok)).json()["items"]
    assert [x for x in lst if x["id"] == shop.tenant.id][0]["last_login_at"] is not None


async def test_idle_paying_tenant_is_flagged_but_active_one_is_not(api, platform_admin, shop, shop2):
    async with SessionFactory() as db:
        for t in (shop, shop2):
            db.add(Subscription(tenant_id=t.tenant.id, plan_name="Aylık", start_date=TODAY - timedelta(days=5),
                                end_date=TODAY + timedelta(days=25), price=1000, is_trial=False))
        # shop: hiç etkinlik yok ve işletme 30 gün önce açıldı; shop2: dün giriş yaptı
        from app.models.tenant import Tenant
        await db.execute(update(Tenant).where(Tenant.id == shop.tenant.id).values(created_at=datetime.now() - timedelta(days=30)))
        await db.execute(update(Staff).where(Staff.id == shop2.owner.id).values(last_login_at=datetime.now() - timedelta(days=1)))
        await db.commit()
    q = (await api.get("/api/platform/actions", token=mint_platform_token(platform_admin))).json()
    idle = {i["tenant_id"] for i in q["items"] if i["category"] == "activity"}
    assert shop.tenant.id in idle and shop2.tenant.id not in idle
