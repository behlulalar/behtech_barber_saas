"""Platform Genel Bakış metrikleri: MRR/ARR, tahsilat serisi, yenileme, risk."""
from datetime import date, datetime, time, timedelta

from sqlalchemy import update

from app.core.database import SessionFactory
from app.models.appointment import AppointmentStatus
from app.models.payment import Payment
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.models.tenant import Tenant
from app.services.metrics_services import _month_keys, monthly_value
from tests.factories import *  # noqa
from tests.helpers import *  # noqa

TODAY = date.today()


async def add_sub(tid, start, end, price, plan_name="Paket", plan_id=None, is_trial=False):
    async with SessionFactory() as db:
        s = Subscription(tenant_id=tid, plan_id=plan_id, plan_name=plan_name, start_date=start, end_date=end,
                         price=price, is_trial=is_trial)
        db.add(s)
        await db.commit()
        return s


async def add_plan(name, months, price):
    async with SessionFactory() as db:
        p = Plan(name=name, duration_months=months, price=price)
        db.add(p)
        await db.commit()
        return p


async def add_payment(tid, amount, paid_on, sub_id=None):
    async with SessionFactory() as db:
        db.add(Payment(tenant_id=tid, subscription_id=sub_id, amount=amount, paid_on=paid_on))
        await db.commit()


async def age_tenant(tid, days):
    async with SessionFactory() as db:
        await db.execute(update(Tenant).where(Tenant.id == tid).values(created_at=datetime.now() - timedelta(days=days)))
        await db.commit()


def test_month_keys_cross_year():
    assert _month_keys(date(2026, 2, 10), 4) == ["2025-11", "2025-12", "2026-01", "2026-02"]


def test_monthly_value_plan_and_derived_months():
    plan = Plan(id=1, name="Yıllık", duration_months=12, price=0)
    s1 = Subscription(plan_id=1, start_date=date(2026, 1, 1), end_date=date(2026, 12, 31), price=12000)
    assert monthly_value(s1, {1: plan}) == 1000
    s2 = Subscription(plan_id=None, start_date=date(2026, 1, 1), end_date=date(2026, 3, 31), price=3000)  # 90 gün ≈ 3 ay
    assert round(monthly_value(s2, {})) == 1000
    s3 = Subscription(plan_id=None, start_date=date(2026, 1, 1), end_date=date(2026, 1, 10), price=500)  # <1 ay -> 1
    assert monthly_value(s3, {}) == 500


async def test_requires_platform_admin(api, shop):
    assert (await api.get("/api/platform/metrics/overview")).status_code == 401
    assert (await api.get("/api/platform/metrics/overview", token=shop.owner_token)).status_code == 401


async def test_mrr_arr_trials_and_plan_distribution(api, platform_admin):
    tok = mint_platform_token(platform_admin)
    yearly = await add_plan("Yıllık", 12, 12000)
    a = await make_shop("a-shop", phone_offset=10)
    b = await make_shop("b-shop", phone_offset=20)
    c = await make_shop("c-shop", phone_offset=30)
    d = await make_shop("d-shop", phone_offset=40)
    await add_sub(a.tenant.id, TODAY - timedelta(days=5), TODAY + timedelta(days=25), 1000, "Aylık")  # türetilmiş 1 ay -> 1000
    await add_sub(b.tenant.id, TODAY - timedelta(days=10), TODAY + timedelta(days=355), 12000, "Yıllık", yearly.id)  # 1000
    await add_sub(c.tenant.id, TODAY - timedelta(days=2), TODAY + timedelta(days=12), 0, "Deneme", is_trial=True)
    await add_sub(d.tenant.id, TODAY - timedelta(days=100), TODAY - timedelta(days=40), 600, "Eski")  # kapsamıyor
    m = (await api.get("/api/platform/metrics/overview", token=tok)).json()
    assert m["mrr"] == 2000 and m["arr"] == 24000
    assert m["paying_tenants"] == 2 and m["trial_tenants"] == 1
    assert {p["plan_name"]: (p["tenants"], p["mrr"]) for p in m["plan_distribution"]} == {"Aylık": (1, 1000), "Yıllık": (1, 1000)}
    assert len(m["monthly_revenue"]) == 12
    rn = {r["slug"]: r for r in m["renewals_next_30"]}
    assert set(rn) == {"a-shop", "c-shop"} and rn["c-shop"]["is_trial"] is True and rn["a-shop"]["days_left"] == 25


async def test_monthly_revenue_zero_filled_and_month_collected(api, platform_admin):
    tok = mint_platform_token(platform_admin)
    s = await make_shop("rev-shop")
    await add_payment(s.tenant.id, 700, TODAY)
    await add_payment(s.tenant.id, 300, TODAY.replace(day=1))
    old = TODAY.replace(day=1) - timedelta(days=40)
    await add_payment(s.tenant.id, 500, old)
    await add_payment(s.tenant.id, 999, TODAY - timedelta(days=800))  # pencere dışı
    m = (await api.get("/api/platform/metrics/overview", token=tok)).json()
    series = {r["month"]: r["revenue"] for r in m["monthly_revenue"]}
    assert m["month_collected"] == 1000
    assert series[TODAY.strftime("%Y-%m")] == 1000 and series[old.strftime("%Y-%m")] == 500
    assert sum(series.values()) == 1500 and len(series) == 12


async def test_at_risk_and_churn_and_top_usage(api, platform_admin):
    tok = mint_platform_token(platform_admin)
    quiet = await make_shop("quiet", phone_offset=10)      # eski, hiç randevu yok -> risk
    young = await make_shop("young", phone_offset=20)      # yeni -> dışlanır
    drop = await make_shop("drop", phone_offset=30)        # önceki 30 gün 12, son 30 gün 3 -> düşüş
    busy = await make_shop("busy", phone_offset=40)        # sağlıklı
    for sh in (quiet, drop, busy):
        await age_tenant(sh.tenant.id, 60)
    cust = {sh.slug: await make_customer(sh.tenant.id, "5559990001") for sh in (drop, busy)}
    for i in range(12):
        await make_appointment(drop.tenant.id, cust["drop"].id, drop.staff.id, drop.cut.id,
                               TODAY - timedelta(days=31 + i), time(10, 0), AppointmentStatus.COMPLETED)
    for i in range(3):
        await make_appointment(drop.tenant.id, cust["drop"].id, drop.staff.id, drop.cut.id,
                               TODAY - timedelta(days=1 + i), time(10, 0), AppointmentStatus.COMPLETED)
    for i in range(6):
        await make_appointment(busy.tenant.id, cust["busy"].id, busy.staff.id, busy.cut.id,
                               TODAY - timedelta(days=i), time(10, 0), AppointmentStatus.COMPLETED)
    await make_appointment(busy.tenant.id, cust["busy"].id, busy.staff2.id, busy.cut.id,
                           TODAY - timedelta(days=2), time(10, 0), AppointmentStatus.CANCELLED)
    gone = await make_shop("gone", phone_offset=50)
    await add_sub(gone.tenant.id, TODAY - timedelta(days=20), TODAY - timedelta(days=6), 0, "Deneme", is_trial=True)
    async with SessionFactory() as db:
        await db.execute(update(Tenant).where(Tenant.id == gone.tenant.id)
                         .values(is_active=False, auto_suspended_at=datetime.now() - timedelta(days=5)))
        await db.commit()
    m = (await api.get("/api/platform/metrics/overview", token=tok)).json()
    risk = {r["slug"]: r for r in m["at_risk"]}
    assert "young" not in risk and "busy" not in risk and "gone" not in risk
    assert risk["quiet"]["reason"] == "30+ gündür randevu yok" and risk["quiet"]["last_appointment_date"] is None
    assert risk["drop"]["reason"] == "Randevular %75 düştü"
    assert (risk["drop"]["appointments_30d"], risk["drop"]["appointments_prev_30d"]) == (3, 12)
    assert m["churned_last_30"] == [{"tenant_id": gone.tenant.id, "tenant_name": gone.tenant.name, "reason": "deneme bitti"}]
    top = m["top_usage"]
    assert top[0]["tenant_name"] == busy.tenant.name and top[0]["appointments_30d"] == 6
    assert len(top) <= 5
