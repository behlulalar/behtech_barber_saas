"""14 günlük deneme: oluşturma, durumlar, ek süresiz bitiş, dönüşüm, istatistik, şablon."""
from datetime import date, timedelta

from sqlalchemy import select

from app.core.database import SessionFactory
from app.models.audit_log import AuditLog
from app.models.plan import Plan
from app.models.subscription import Subscription
from tests.factories import *  # noqa
from tests.helpers import *  # noqa

TODAY = date.today()


async def add_trial_sub(tenant_id, start, end) -> Subscription:
    async with SessionFactory() as db:
        s = Subscription(tenant_id=tenant_id, plan_name="Deneme", start_date=start, end_date=end, price=0, is_trial=True)
        db.add(s)
        await db.commit()
        return s


async def add_paid(tenant_id, start, end, price=1000) -> Subscription:
    async with SessionFactory() as db:
        s = Subscription(tenant_id=tenant_id, plan_name="Aylık", start_date=start, end_date=end, price=price)
        db.add(s)
        await db.commit()
        return s


async def billing(api, tok, tenant_id):
    rows = (await api.get("/api/platform/billing/tenants", token=tok)).json()
    return next(r for r in rows if r["tenant_id"] == tenant_id)


async def is_active(tenant_id) -> bool:
    async with SessionFactory() as db:
        return (await db.get(Tenant, tenant_id)).is_active


async def test_start_trial_endpoint(api, platform_admin, shop):
    tok = mint_platform_token(platform_admin)
    r = await api.post(f"/api/platform/tenants/{shop.tenant.id}/trial", token=tok, json={})
    assert r.status_code == 201, r.text
    s = r.json()
    assert s["is_trial"] is True and s["plan_name"] == "Deneme" and s["price"] == 0 and s["plan_id"] is None
    assert s["start_date"] == str(TODAY) and s["end_date"] == str(TODAY + timedelta(days=13))
    assert s["note"] == "14 günlük deneme"
    async with SessionFactory() as db:
        a = (await db.execute(select(AuditLog).where(AuditLog.action == "subscription.create"))).scalar_one()
    assert "Deneme dönemi başlatıldı" in a.summary
    b = await billing(api, tok, shop.tenant.id)
    assert b["status"] == "trial" and b["is_trial"] is True and b["days_left"] == 13 and b["trial_ending"] is False


async def test_trial_custom_days_and_overlap_and_validation(api, platform_admin, shop):
    tok = mint_platform_token(platform_admin)
    url = f"/api/platform/tenants/{shop.tenant.id}/trial"
    assert (await api.post(url, token=tok, json={"days": 0})).status_code == 422
    assert (await api.post(url, token=tok, json={"days": 61})).status_code == 422
    r = await api.post(url, token=tok, json={"days": 7})
    assert r.status_code == 201 and r.json()["end_date"] == str(TODAY + timedelta(days=6))
    assert (await api.post(url, token=tok, json={"days": 7})).status_code == 409  # çakışma
    assert (await api.post("/api/platform/tenants/9999/trial", token=tok, json={})).status_code == 404


async def test_create_tenant_with_trial_in_same_request(api, platform_admin):
    tok = mint_platform_token(platform_admin)
    payload = {"name": "Denemeli", "slug": "denemeli", "owner_name": "ali", "owner_surname": "veli",
               "owner_phone": "5321112299", "owner_password": "owner-pass-1", "start_trial": True, "trial_days": 10}
    r = await api.post("/api/platform/tenants", token=tok, json=payload)
    assert r.status_code == 200, r.text
    b = await billing(api, tok, r.json()["id"])
    assert b["status"] == "trial" and b["days_left"] == 9
    # start_trial verilmezse dönem yok
    payload.update(slug="denemesiz", owner_phone="5321112298", start_trial=False)
    r2 = await api.post("/api/platform/tenants", token=tok, json=payload)
    assert (await billing(api, tok, r2.json()["id"]))["status"] == "untracked"


async def test_trial_ending_flag_and_attention(api, platform_admin, shop):
    tok = mint_platform_token(platform_admin)
    await add_trial_sub(shop.tenant.id, TODAY - timedelta(days=11), TODAY + timedelta(days=2))
    b = await billing(api, tok, shop.tenant.id)
    assert b["status"] == "trial" and b["trial_ending"] is True and b["days_left"] == 2
    ov = (await api.get("/api/platform/billing/overview", token=tok)).json()
    assert [x["tenant_id"] for x in ov["attention"]] == [shop.tenant.id]
    assert ov["stats"]["trial_count"] == 1 and ov["stats"]["trial_ending_count"] == 1


async def test_trial_expiry_is_immediate_without_grace_and_run_checks_suspends(api, platform_admin, shop):
    tok = mint_platform_token(platform_admin)
    await add_trial_sub(shop.tenant.id, TODAY - timedelta(days=14), TODAY - timedelta(days=1))
    b = await billing(api, tok, shop.tenant.id)
    assert b["status"] == "expired" and b["is_trial"] is True  # grace_days (7) trial'a uygulanmaz
    res = (await api.post("/api/platform/billing/run-checks", token=tok)).json()
    assert res["suspended"] == ["Alfa"]
    assert not await is_active(shop.tenant.id)
    async with SessionFactory() as db:
        a = (await db.execute(select(AuditLog).where(AuditLog.action == "billing.auto_suspend"))).scalar_one()
    assert "deneme süresi bitti" in a.summary
    r = await api.get("/api/auth/me", slug="alfa", token=shop.owner_token)
    assert r.status_code == 403  # "hizmet vermiyor"


async def test_paid_period_after_trial_reopens_and_uses_normal_rules(api, platform_admin, shop):
    tok = mint_platform_token(platform_admin)
    await add_trial_sub(shop.tenant.id, TODAY - timedelta(days=14), TODAY - timedelta(days=1))
    await api.post("/api/platform/billing/run-checks", token=tok)
    assert not await is_active(shop.tenant.id)
    r = await api.post(f"/api/platform/tenants/{shop.tenant.id}/subscriptions", token=tok,
                       json={"plan_name": "Aylık", "start_date": str(TODAY), "end_date": str(TODAY + timedelta(days=29)), "price": 1000})
    assert r.status_code == 201 and r.json()["is_trial"] is False
    assert await is_active(shop.tenant.id)
    assert (await billing(api, tok, shop.tenant.id))["status"] == "active"


async def test_paid_period_scheduled_after_running_trial_is_converted_not_trial(api, platform_admin, shop):
    tok = mint_platform_token(platform_admin)
    await add_trial_sub(shop.tenant.id, TODAY - timedelta(days=3), TODAY + timedelta(days=10))
    await add_paid(shop.tenant.id, TODAY + timedelta(days=11), TODAY + timedelta(days=40))
    b = await billing(api, tok, shop.tenant.id)
    assert b["status"] == "active" and b["trial_ending"] is False and b["is_trial"] is False


async def test_trial_end_not_suspended_when_paid_follows_even_after_trial_ended(api, platform_admin, shop):
    tok = mint_platform_token(platform_admin)
    await add_trial_sub(shop.tenant.id, TODAY - timedelta(days=20), TODAY - timedelta(days=6))
    await add_paid(shop.tenant.id, TODAY - timedelta(days=5), TODAY + timedelta(days=25))
    res = (await api.post("/api/platform/billing/run-checks", token=tok)).json()
    assert res["suspended"] == [] and await is_active(shop.tenant.id)


async def test_suggest_start_after_trial(api, platform_admin, shop):
    tok = mint_platform_token(platform_admin)
    async with SessionFactory() as db:
        p = Plan(name="Aylık", duration_months=1, price=1000)
        db.add(p)
        await db.commit()
    url = f"/api/platform/tenants/{shop.tenant.id}/subscriptions/suggest?plan_id={p.id}"
    trial_end = TODAY + timedelta(days=5)
    await add_trial_sub(shop.tenant.id, TODAY - timedelta(days=9), trial_end)
    assert (await api.get(url, token=tok)).json()["start_date"] == str(trial_end + timedelta(days=1))


async def test_suggest_start_is_today_when_trial_long_ended(api, platform_admin, shop):
    tok = mint_platform_token(platform_admin)
    async with SessionFactory() as db:
        p = Plan(name="Aylık", duration_months=1, price=1000)
        db.add(p)
        await db.commit()
    await add_trial_sub(shop.tenant.id, TODAY - timedelta(days=60), TODAY - timedelta(days=46))
    r = await api.get(f"/api/platform/tenants/{shop.tenant.id}/subscriptions/suggest?plan_id={p.id}", token=tok)
    assert r.json()["start_date"] == str(TODAY)


async def test_stats_exclude_trials_and_conversion_rate(api, platform_admin, shop, shop2):
    tok = mint_platform_token(platform_admin)
    ov = (await api.get("/api/platform/billing/overview", token=tok)).json()
    assert ov["stats"]["trial_conversion_rate"] is None and ov["stats"]["trial_count"] == 0
    # shop: deneme bitti, ücretliye geçti; shop2: deneme bitti, geçmedi
    await add_trial_sub(shop.tenant.id, TODAY - timedelta(days=30), TODAY - timedelta(days=16))
    paid = await add_paid(shop.tenant.id, TODAY - timedelta(days=15), TODAY + timedelta(days=14), 1000)
    await add_trial_sub(shop2.tenant.id, TODAY - timedelta(days=30), TODAY - timedelta(days=16))
    s = (await api.post("/api/platform/payments", token=tok, json={
        "tenant_id": shop.tenant.id, "subscription_id": paid.id, "amount": 1000, "paid_on": str(TODAY)})).status_code
    assert s == 201
    ov = (await api.get("/api/platform/billing/overview", token=tok)).json()["stats"]
    assert ov["trial_conversion_rate"] == 0.5
    assert ov["revenue_this_year"] == 1000 and ov["outstanding_total"] == 0  # denemeler gelire/borca girmez
    assert ov["trial_count"] == 0


async def test_trial_still_running_not_counted_in_conversion(api, platform_admin, shop):
    tok = mint_platform_token(platform_admin)
    await add_trial_sub(shop.tenant.id, TODAY - timedelta(days=2), TODAY + timedelta(days=11))
    st = (await api.get("/api/platform/billing/overview", token=tok)).json()["stats"]
    assert st["trial_conversion_rate"] is None and st["trial_count"] == 1


async def test_trial_template_in_settings(api, platform_admin):
    tok = mint_platform_token(platform_admin)
    s = (await api.get("/api/platform/settings", token=tok)).json()
    assert "{kalan_gun}" in s["trial_template"] and "askıya alınır" in s["trial_template"]
    body = {k: s[k] for k in ("iban", "account_holder", "bank_name", "reminder_days", "grace_days", "notify_email",
                              "reminder_template", "overdue_template")}
    # trial_template gönderilmezse korunur
    r = await api.put("/api/platform/settings", token=tok, json=body)
    assert r.status_code == 200 and r.json()["trial_template"] == s["trial_template"]
    r = await api.put("/api/platform/settings", token=tok, json={**body, "trial_template": "Yeni {sahip}"})
    assert r.status_code == 200 and r.json()["trial_template"] == "Yeni {sahip}"
    assert (await api.put("/api/platform/settings", token=tok, json={**body, "trial_template": "x" * 2001})).status_code == 422
    async with SessionFactory() as db:
        a = (await db.execute(select(AuditLog).where(AuditLog.action == "settings.update").order_by(AuditLog.id.desc()))).scalars().first()
    assert a.details == {"changed_fields": ["trial_template"]}
    assert "Yeni" not in str(a.details)
