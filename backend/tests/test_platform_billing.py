"""Platform girişi, işletme yönetimi, abonelik/ödeme ve günlük kontrolün (run-checks) askıya alma/yeniden açma mantığı."""
from datetime import date, timedelta

from sqlalchemy import select

from app.core.database import SessionFactory
from app.models.payment import Payment
from app.models.subscription import Subscription
from app.models.tenant import Tenant
from tests.factories import *  # noqa
from tests.helpers import *  # noqa

TODAY = date.today()


async def padmin_token(admin) -> str:
    return mint_platform_token(admin)


async def add_sub(tenant_id, start, end, price=1000, plan_name="Aylık") -> Subscription:
    async with SessionFactory() as db:
        s = Subscription(tenant_id=tenant_id, plan_name=plan_name, start_date=start, end_date=end, price=price)
        db.add(s)
        await db.commit()
        return s


async def tenant_row(tenant_id) -> Tenant:
    async with SessionFactory() as db:
        t = await db.get(Tenant, tenant_id)
        await db.refresh(t)
        return t


async def run_checks(api, token):
    r = await api.post("/api/platform/billing/run-checks", token=token)
    assert r.status_code == 200, r.text
    return r.json()


# ------------------------------------------------------------------ platform auth
async def test_platform_login_success(api, platform_admin):
    r = await api.post("/api/platform/login", json={"phone": PLATFORM_PHONE, "password": PLATFORM_PASSWORD})
    assert r.status_code == 200
    tok = r.json()["access_token"]
    me = await api.get("/api/platform/me", token=tok)
    assert me.status_code == 200 and me.json()["phone"] == PLATFORM_PHONE


async def test_platform_login_wrong_password_and_unknown_phone_401_same_message(api, platform_admin):
    r1 = await api.post("/api/platform/login", json={"phone": PLATFORM_PHONE, "password": "yanlis-sifre"})
    r2 = await api.post("/api/platform/login", json={"phone": "5009999999", "password": "yanlis-sifre"})
    assert r1.status_code == 401 and r2.status_code == 401
    assert r1.json()["detail"] == r2.json()["detail"] == "Telefon veya şifre hatalı"  # kullanıcı varlığı sızmaz


async def test_platform_auth_is_tenant_independent(api, platform_admin, shop):
    """Platform girişi/token'ı Host'a bakmaz; pasif işletme host'unda bile çalışır."""
    tok = await padmin_token(platform_admin)
    for slug in (None, "alfa", "tanimsiz-isletme"):
        assert (await api.get("/api/platform/me", slug=slug, token=tok)).status_code == 200
    r = await api.post("/api/platform/login", slug="alfa", json={"phone": PLATFORM_PHONE, "password": PLATFORM_PASSWORD})
    assert r.status_code == 200


async def test_platform_and_staff_credentials_are_not_interchangeable(api, platform_admin, shop):
    # personel telefon/şifresi platform girişinde geçmez
    r = await api.post("/api/platform/login", json={"phone": shop.owner.phone, "password": PASSWORD})
    assert r.status_code == 401
    # platform yöneticisi şifresiyle işletme girişi yapılamaz
    r = await api.post("/api/auth/login", slug="alfa", json={"phone": PLATFORM_PHONE, "password": PLATFORM_PASSWORD})
    assert r.status_code == 401


async def test_staff_login_flow(api, shop):
    r = await api.post("/api/auth/login", slug="alfa", json={"phone": shop.owner.phone, "password": PASSWORD})
    assert r.status_code == 200
    tok = r.json()["access_token"]
    me = (await api.get("/api/auth/me", slug="alfa", token=tok)).json()
    assert me["id"] == shop.owner.id and me["role"] == "super_admin"
    bad = await api.post("/api/auth/login", slug="alfa", json={"phone": shop.owner.phone, "password": "x" * 8})
    assert bad.status_code == 401 and bad.json()["detail"] == "Telefon veya şifre hatalı"
    unknown = await api.post("/api/auth/login", slug="alfa", json={"phone": "5000000009", "password": "x" * 8})
    assert unknown.status_code == 401 and unknown.json()["detail"] == bad.json()["detail"]


async def test_platform_routes_require_platform_token(api, shop):
    for path in ("/api/platform/tenants", "/api/platform/stats", "/api/platform/plans",
                 "/api/platform/billing/overview", "/api/platform/payments", "/api/platform/settings"):
        assert (await api.get(path)).status_code == 401, path
        assert (await api.get(path, token=shop.owner_token)).status_code == 401, path
    assert (await api.post("/api/platform/billing/run-checks")).status_code == 401


# ------------------------------------------------------------------ tenant yönetimi
async def test_platform_create_tenant_and_owner_can_login(api, platform_admin):
    tok = await padmin_token(platform_admin)
    payload = {"name": "Yeni Berber", "slug": "yeni-berber", "owner_name": "mehmet", "owner_surname": "ÖZTÜRK",
               "owner_phone": "5321112233", "owner_password": "owner-pass-1"}
    r = await api.post("/api/platform/tenants", token=tok, json=payload)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["slug"] == "yeni-berber" and out["is_active"] is True and out["staff_count"] == 1
    assert out["owner_name"] == "Mehmet Öztürk" and out["owner_phone"] == "5321112233"
    login = await api.post("/api/auth/login", slug="yeni-berber", json={"phone": "5321112233", "password": "owner-pass-1"})
    assert login.status_code == 200
    # public tenant ayarları da oluşmuş
    assert (await api.get("/api/public/tenant", slug="yeni-berber")).json()["business_name"] == "Yeni Berber"
    # aynı slug 409
    assert (await api.post("/api/platform/tenants", token=tok, json=payload)).status_code == 409


async def test_platform_create_tenant_validation(api, platform_admin):
    tok = await padmin_token(platform_admin)
    base = {"name": "X", "owner_name": "a", "owner_surname": "b", "owner_phone": "5321112233", "owner_password": "123456"}
    for slug in ("api", "www", "ab", "-abc", "abc-", "Büyük", "has space"):
        r = await api.post("/api/platform/tenants", token=tok, json={**base, "slug": slug})
        assert r.status_code == 400, slug
    r = await api.post("/api/platform/tenants", token=tok, json={**base, "slug": "gecerli", "owner_phone": "123"})
    assert r.status_code == 422


async def test_platform_deactivate_tenant_blocks_it_and_reactivate_restores(api, platform_admin, shop):
    tok = await padmin_token(platform_admin)
    r = await api.patch(f"/api/platform/tenants/{shop.tenant.id}", token=tok, json={"is_active": False})
    assert r.status_code == 200 and r.json()["is_active"] is False
    assert (await api.get("/api/public/tenant", slug="alfa")).status_code == 403
    r = await api.patch(f"/api/platform/tenants/{shop.tenant.id}", token=tok, json={"is_active": True})
    assert r.json()["is_active"] is True
    assert (await api.get("/api/public/tenant", slug="alfa")).status_code == 200
    assert (await api.patch("/api/platform/tenants/99999", token=tok, json={"is_active": True})).status_code == 404


async def test_manual_activate_clears_auto_suspension_marker(api, platform_admin, shop):
    async with SessionFactory() as db:
        t = await db.get(Tenant, shop.tenant.id)
        t.is_active, t.auto_suspended_at = False, datetime.now()
        await db.commit()
    tok = await padmin_token(platform_admin)
    await api.patch(f"/api/platform/tenants/{shop.tenant.id}", token=tok, json={"is_active": True})
    t = await tenant_row(shop.tenant.id)
    assert t.is_active is True and t.auto_suspended_at is None


# ------------------------------------------------------------------ run-checks
from datetime import datetime  # noqa: E402


async def test_run_checks_suspends_expired_tenant(api, platform_admin, shop):
    await add_sub(shop.tenant.id, TODAY - timedelta(days=60), TODAY - timedelta(days=30))  # grace (7) çoktan geçti
    tok = await padmin_token(platform_admin)
    res = await run_checks(api, tok)
    assert res["checked"] == 1 and res["suspended"] == [shop.tenant.name]
    t = await tenant_row(shop.tenant.id)
    assert t.is_active is False and t.auto_suspended_at is not None
    assert (await api.get("/api/public/tenant", slug="alfa")).status_code == 403
    # ikinci çalıştırma tekrar askıya almaz
    assert (await run_checks(api, tok))["suspended"] == []


async def test_run_checks_never_suspends_tenant_without_periods(api, platform_admin, shop):
    tok = await padmin_token(platform_admin)
    res = await run_checks(api, tok)
    assert res["checked"] == 0 and res["suspended"] == []
    assert (await tenant_row(shop.tenant.id)).is_active is True
    assert (await api.get("/api/public/tenant", slug="alfa")).status_code == 200


async def test_run_checks_grace_and_active_are_not_suspended(api, platform_admin, shop, shop2):
    await add_sub(shop.tenant.id, TODAY - timedelta(days=40), TODAY - timedelta(days=3))   # grace
    await add_sub(shop2.tenant.id, TODAY - timedelta(days=5), TODAY + timedelta(days=25))  # active
    tok = await padmin_token(platform_admin)
    res = await run_checks(api, tok)
    assert res["checked"] == 2 and res["suspended"] == []
    assert (await tenant_row(shop.tenant.id)).is_active is True


async def test_run_checks_suspends_only_expired_one(api, platform_admin, shop, shop2):
    await add_sub(shop.tenant.id, TODAY - timedelta(days=90), TODAY - timedelta(days=60))
    await add_sub(shop2.tenant.id, TODAY - timedelta(days=5), TODAY + timedelta(days=25))
    res = await run_checks(api, await padmin_token(platform_admin))
    assert res["suspended"] == [shop.tenant.name]
    assert (await tenant_row(shop2.tenant.id)).is_active is True


async def test_run_checks_does_not_touch_manually_deactivated_tenant(api, platform_admin, shop):
    async with SessionFactory() as db:
        t = await db.get(Tenant, shop.tenant.id)
        t.is_active = False  # elle kapatıldı: auto_suspended_at yok
        await db.commit()
    await add_sub(shop.tenant.id, TODAY - timedelta(days=5), TODAY + timedelta(days=25))  # kapsanıyor
    res = await run_checks(api, await padmin_token(platform_admin))
    assert res["reactivated"] == []
    assert (await tenant_row(shop.tenant.id)).is_active is False  # elle kapatılan elle açılır


async def test_run_checks_reactivates_when_covered_again(api, platform_admin, shop):
    async with SessionFactory() as db:
        t = await db.get(Tenant, shop.tenant.id)
        t.is_active, t.auto_suspended_at = False, datetime.now()
        await db.commit()
    await add_sub(shop.tenant.id, TODAY - timedelta(days=2), TODAY + timedelta(days=28))
    res = await run_checks(api, await padmin_token(platform_admin))
    assert res["reactivated"] == [shop.tenant.name]
    t = await tenant_row(shop.tenant.id)
    assert t.is_active is True and t.auto_suspended_at is None


async def test_adding_period_reopens_auto_suspended_tenant(api, platform_admin, shop):
    tok = await padmin_token(platform_admin)
    await add_sub(shop.tenant.id, TODAY - timedelta(days=90), TODAY - timedelta(days=60))
    await run_checks(api, tok)
    assert (await api.get("/api/public/tenant", slug="alfa")).status_code == 403
    r = await api.post(f"/api/platform/tenants/{shop.tenant.id}/subscriptions", token=tok, json={
        "start_date": (TODAY - timedelta(days=1)).isoformat(), "end_date": (TODAY + timedelta(days=29)).isoformat(),
        "price": 1500, "plan_name": "Özel"})
    assert r.status_code == 201, r.text
    t = await tenant_row(shop.tenant.id)
    assert t.is_active is True and t.auto_suspended_at is None
    assert (await api.get("/api/public/tenant", slug="alfa")).status_code == 200


async def test_adding_payment_reopens_auto_suspended_tenant_when_covered(api, platform_admin, shop):
    tok = await padmin_token(platform_admin)
    sub = await add_sub(shop.tenant.id, TODAY - timedelta(days=5), TODAY + timedelta(days=25))
    async with SessionFactory() as db:
        t = await db.get(Tenant, shop.tenant.id)
        t.is_active, t.auto_suspended_at = False, datetime.now()
        await db.commit()
    r = await api.post("/api/platform/payments", token=tok, json={
        "tenant_id": shop.tenant.id, "subscription_id": sub.id, "amount": 1000, "paid_on": TODAY.isoformat()})
    assert r.status_code == 201 and r.json()["amount"] == 1000
    assert (await tenant_row(shop.tenant.id)).is_active is True


async def test_payment_does_not_reopen_tenant_still_expired(api, platform_admin, shop):
    tok = await padmin_token(platform_admin)
    sub = await add_sub(shop.tenant.id, TODAY - timedelta(days=90), TODAY - timedelta(days=60))
    await run_checks(api, tok)
    await api.post("/api/platform/payments", token=tok, json={
        "tenant_id": shop.tenant.id, "subscription_id": sub.id, "amount": 1000, "paid_on": TODAY.isoformat()})
    assert (await tenant_row(shop.tenant.id)).is_active is False  # ödeme tek başına dönemi uzatmaz


# ------------------------------------------------------------------ abonelik/ödeme API
async def test_subscription_overlap_rejected_and_period_end_end_of_month(api, platform_admin, shop):
    tok = await padmin_token(platform_admin)
    plan = (await api.post("/api/platform/plans", token=tok,
                           json={"name": "Aylık", "duration_months": 1, "price": 900})).json()
    r = await api.post(f"/api/platform/tenants/{shop.tenant.id}/subscriptions", token=tok,
                       json={"plan_id": plan["id"], "start_date": "2027-01-31"})
    assert r.status_code == 201, r.text
    assert r.json()["end_date"] == "2027-02-28" and r.json()["price"] == 900
    overlap = await api.post(f"/api/platform/tenants/{shop.tenant.id}/subscriptions", token=tok,
                             json={"plan_id": plan["id"], "start_date": "2027-02-15"})
    assert overlap.status_code == 409
    leap = await api.post(f"/api/platform/tenants/{shop2_id(shop)}/subscriptions", token=tok,
                          json={"plan_id": plan["id"], "start_date": "2028-01-31"})
    assert leap.json()["end_date"] == "2028-02-29"


def shop2_id(shop):
    return shop.tenant.id  # aynı tenant, çakışmayan farklı dönem


async def test_subscription_payment_status_and_overpayment(api, platform_admin, shop):
    tok = await padmin_token(platform_admin)
    r = await api.post(f"/api/platform/tenants/{shop.tenant.id}/subscriptions", token=tok, json={
        "start_date": TODAY.isoformat(), "end_date": (TODAY + timedelta(days=29)).isoformat(), "price": 1000,
        "initial_payment": {"amount": 400, "paid_on": TODAY.isoformat(), "method": "IBAN"}})
    assert r.status_code == 201
    s = r.json()
    assert s["paid_amount"] == 400 and s["balance"] == 600 and s["payment_status"] == "partial"
    r = await api.post("/api/platform/payments", token=tok, json={
        "tenant_id": shop.tenant.id, "subscription_id": s["id"], "amount": 700, "paid_on": TODAY.isoformat()})
    assert r.status_code == 201
    subs = (await api.get(f"/api/platform/tenants/{shop.tenant.id}/subscriptions", token=tok)).json()
    assert subs[0]["paid_amount"] == 1100 and subs[0]["balance"] == -100 and subs[0]["payment_status"] == "paid"


async def test_payment_validation(api, platform_admin, shop, shop2):
    tok = await padmin_token(platform_admin)
    sub = await add_sub(shop.tenant.id, TODAY, TODAY + timedelta(days=29))
    ok = {"tenant_id": shop.tenant.id, "subscription_id": sub.id, "amount": 100, "paid_on": TODAY.isoformat()}
    assert (await api.post("/api/platform/payments", token=tok, json={**ok, "amount": 0})).status_code == 422
    assert (await api.post("/api/platform/payments", token=tok, json={**ok, "amount": -5})).status_code == 422
    # dönem başka işletmeye ait
    r = await api.post("/api/platform/payments", token=tok, json={**ok, "tenant_id": shop2.tenant.id})
    assert r.status_code == 400
    assert (await api.post("/api/platform/payments", token=tok, json={**ok, "tenant_id": 99999})).status_code == 404


async def test_cannot_delete_subscription_with_payments(api, platform_admin, shop):
    tok = await padmin_token(platform_admin)
    sub = await add_sub(shop.tenant.id, TODAY, TODAY + timedelta(days=29))
    pay = (await api.post("/api/platform/payments", token=tok, json={
        "tenant_id": shop.tenant.id, "subscription_id": sub.id, "amount": 100, "paid_on": TODAY.isoformat()})).json()
    assert (await api.delete(f"/api/platform/subscriptions/{sub.id}", token=tok)).status_code == 409
    assert (await api.delete(f"/api/platform/payments/{pay['id']}", token=tok)).status_code == 204
    assert (await api.delete(f"/api/platform/subscriptions/{sub.id}", token=tok)).status_code == 204
    async with SessionFactory() as db:
        assert (await db.execute(select(Payment))).first() is None


async def test_plan_in_use_cannot_be_deleted(api, platform_admin, shop):
    tok = await padmin_token(platform_admin)
    plan = (await api.post("/api/platform/plans", token=tok, json={"name": "Yıllık", "duration_months": 12, "price": 9000})).json()
    assert (await api.post("/api/platform/plans", token=tok, json={"name": "Yıllık", "duration_months": 1, "price": 1})).status_code == 409
    await api.post(f"/api/platform/tenants/{shop.tenant.id}/subscriptions", token=tok,
                   json={"plan_id": plan["id"], "start_date": TODAY.isoformat()})
    assert (await api.delete(f"/api/platform/plans/{plan['id']}", token=tok)).status_code == 409


async def test_billing_tenants_state_labels(api, platform_admin, shop, shop2):
    tok = await padmin_token(platform_admin)
    await add_sub(shop.tenant.id, TODAY - timedelta(days=30), TODAY + timedelta(days=2))
    rows = {r["tenant_id"]: r for r in (await api.get("/api/platform/billing/tenants", token=tok)).json()}
    assert rows[shop.tenant.id]["status"] == "due_soon"
    assert rows[shop2.tenant.id]["status"] == "untracked"
