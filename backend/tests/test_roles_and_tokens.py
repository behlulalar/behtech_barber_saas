"""Rol yetki matrisi (sahip vs personel), token tipi ayrımı, pasif işletme."""
import pytest

from tests.factories import *  # noqa
from tests.helpers import *  # noqa
from datetime import date, time, timedelta  # noqa
from app.core.database import SessionFactory  # noqa
from app.core.security import create_access_token  # noqa
from app.models.appointment import AppointmentStatus  # noqa


# ----------------------------------------------------------------------------- rol matrisi
async def test_staff_forbidden_on_manager_only_routes(api, shop):
    t = shop.staff_token
    today = date.today().isoformat()
    forbidden = [
        ("GET", "/api/admin/reports/revenue", None),
        ("GET", "/api/admin/settings", None),
        ("PUT", "/api/admin/settings", {"business_name": "X"}),
        ("PUT", f"/api/admin/working-hours/{shop.staff.id}", []),
        ("POST", "/api/admin/time-off", {"staff_id": shop.staff.id, "start_date": today, "end_date": today}),
        ("POST", "/api/admin/services", {"name": "Yeni", "price": 10, "duration_min": 30}),
        ("PATCH", f"/api/admin/services/{shop.cut.id}", {"price": 1}),
        ("DELETE", f"/api/admin/services/{shop.cut.id}", None),
        ("POST", "/api/admin/staff", {"name": "a", "surname": "b", "phone": "5558887766", "password": "abcdef"}),
        ("PATCH", f"/api/admin/staff/{shop.staff2.id}", {"name": "Z"}),
        ("DELETE", f"/api/admin/staff/{shop.staff2.id}", None),
        ("POST", "/api/admin/payment-methods", {"name": "Nakit"}),
    ]
    for method, path, body in forbidden:
        kw = {"json": body} if body is not None else {}
        r = await api.request(method, path, slug="alfa", token=t, **kw)
        assert r.status_code == 403, f"{method} {path} -> {r.status_code}"


async def test_owner_allowed_on_manager_routes(api, shop):
    t = shop.owner_token
    assert (await api.get("/api/admin/reports/revenue", slug="alfa", token=t)).status_code == 200
    r = await api.get("/api/admin/settings", slug="alfa", token=t)
    assert r.status_code == 200 and r.json()["business_name"] == "Alfa"
    r = await api.put(f"/api/admin/working-hours/{shop.staff.id}", slug="alfa", token=t,
                      json=[{"day_of_week": 1, "start_time": "10:00", "end_time": "16:00"}])
    assert r.status_code == 200 and len(r.json()) == 1
    today = date.today().isoformat()
    r = await api.post("/api/admin/time-off", slug="alfa", token=t,
                       json={"staff_id": shop.staff.id, "start_date": today, "end_date": today})
    assert r.status_code == 201


async def test_staff_list_returns_team_but_hides_colleague_phones(api, shop):
    r = await api.get("/api/admin/staff", slug="alfa", token=shop.staff_token)
    assert r.status_code == 200
    rows = {s["id"]: s for s in r.json()}
    assert set(rows) == {shop.owner.id, shop.staff.id, shop.staff2.id}  # tüm ekip
    assert rows[shop.staff.id]["phone"] == shop.staff.phone            # kendi telefonu görünür
    assert rows[shop.owner.id]["phone"] == ""                          # sahibinki gizli
    assert rows[shop.staff2.id]["phone"] == ""                         # meslektaşınki gizli
    # sahip hepsini görür
    owner_rows = (await api.get("/api/admin/staff", slug="alfa", token=shop.owner_token)).json()
    assert all(s["phone"] for s in owner_rows)


async def test_staff_customers_list_scoped_to_own_customers(api, shop):
    c1 = await make_customer(shop.tenant.id, "5550001111", "Benim", "Musteri")
    c2 = await make_customer(shop.tenant.id, "5550002222", "Baskasinin", "Musteri")
    d = date.today() + timedelta(days=2)
    await make_appointment(shop.tenant.id, c1.id, shop.staff.id, shop.cut.id, d, time(10, 0))
    await make_appointment(shop.tenant.id, c2.id, shop.staff2.id, shop.cut.id, d, time(11, 0))
    mine = (await api.get("/api/admin/customers", slug="alfa", token=shop.staff_token)).json()
    assert [c["phone"] for c in mine] == ["5550001111"]
    assert mine[0]["appointment_count"] == 1
    everyone = (await api.get("/api/admin/customers", slug="alfa", token=shop.owner_token)).json()
    assert {c["phone"] for c in everyone} == {"5550001111", "5550002222"}


async def test_staff_appointments_list_scoped_and_cannot_touch_colleagues(api, shop):
    c = await make_customer(shop.tenant.id, "5550001111")
    d = date.today() + timedelta(days=2)
    mine = await make_appointment(shop.tenant.id, c.id, shop.staff.id, shop.cut.id, d, time(10, 0))
    theirs = await make_appointment(shop.tenant.id, c.id, shop.staff2.id, shop.cut.id, d, time(12, 0))
    # staff_id filtresi ne olursa olsun yalnızca kendi randevuları
    r = await api.get(f"/api/admin/appointments?staff_id={shop.staff2.id}", slug="alfa", token=shop.staff_token)
    assert [a["id"] for a in r.json()] == [mine.id]
    r = await api.patch(f"/api/admin/appointments/{theirs.id}", slug="alfa", token=shop.staff_token,
                        json={"status": "completed"})
    assert r.status_code == 403
    r = await api.patch(f"/api/admin/appointments/{mine.id}", slug="alfa", token=shop.staff_token,
                        json={"status": "completed"})
    assert r.status_code == 200 and r.json()["status"] == "completed"
    # başka personel adına randevu oluşturamaz
    r = await api.post("/api/admin/appointments", slug="alfa", token=shop.staff_token, json={
        "phone": "5550009999", "name": "a", "surname": "b", "staff_id": shop.staff2.id,
        "service_id": shop.cut.id, "appointment_date": d.isoformat(), "appointment_time": "15:00"})
    assert r.status_code == 403


async def test_staff_working_hours_and_time_off_read_limited_to_self(api, shop):
    r = await api.get(f"/api/admin/working-hours?staff_id={shop.staff2.id}", slug="alfa", token=shop.staff_token)
    assert r.status_code == 403
    r = await api.get("/api/admin/working-hours", slug="alfa", token=shop.staff_token)
    assert r.status_code == 200 and len(r.json()) == 7
    r = await api.get(f"/api/admin/time-off?staff_id={shop.staff2.id}", slug="alfa", token=shop.staff_token)
    assert r.status_code == 403


async def test_payment_method_details_hidden_from_staff(api, shop):
    await make_payment_method(shop.tenant.id, "Havale", {"iban": "TR123456789012345678901234"})
    owner = (await api.get("/api/admin/payment-methods", slug="alfa", token=shop.owner_token)).json()
    staff = (await api.get("/api/admin/payment-methods", slug="alfa", token=shop.staff_token)).json()
    assert owner[0]["details"]["iban"].startswith("TR")
    assert staff[0]["name"] == "Havale" and staff[0]["details"] is None
    assert "TR1234" not in (await api.get("/api/admin/payment-methods", slug="alfa", token=shop.staff_token)).text


async def test_dashboard_revenue_null_for_staff_but_present_for_owner(api, shop):
    c = await make_customer(shop.tenant.id, "5550001111")
    today = date.today()
    # 23:30 randevusu; geçmiş/gelecek önemsiz, dashboard "bugün" sayar
    await make_appointment(shop.tenant.id, c.id, shop.staff.id, shop.cut_beard.id, today, time(23, 0))
    s = (await api.get("/api/admin/dashboard", slug="alfa", token=shop.staff_token)).json()
    o = (await api.get("/api/admin/dashboard", slug="alfa", token=shop.owner_token)).json()
    assert s["expected_revenue_today"] is None
    assert o["expected_revenue_today"] == 350
    assert s["appointments_today"] == 1 and o["appointments_today"] == 1


async def test_staff_cannot_create_super_admin_via_owner_only_routes(api, shop):
    # personel yönetici rolü veremez (require_manager zaten 403)
    r = await api.post("/api/admin/staff", slug="alfa", token=shop.staff_token, json={
        "name": "x", "surname": "y", "phone": "5558887766", "password": "abcdef", "role": "super_admin"})
    assert r.status_code == 403


# ----------------------------------------------------------------------------- token tipi ayrımı
async def test_no_token_or_garbage_token_is_401(api, shop):
    for path in ("/api/auth/me", "/api/admin/dashboard"):
        assert (await api.get(path, slug="alfa")).status_code == 401
        assert (await api.get(path, slug="alfa", token="not.a.jwt")).status_code == 401
    assert (await api.get("/api/customer/appointments", slug="alfa")).status_code == 401
    assert (await api.get("/api/platform/me")).status_code == 401


async def test_expired_token_rejected(api, shop):
    tok = create_access_token({"sub": str(shop.owner.id), "tenant_id": shop.tenant.id, "type": "staff"},
                              expires_minutes=-5)
    assert (await api.get("/api/auth/me", slug="alfa", token=tok)).status_code == 401


async def test_token_signed_with_wrong_secret_rejected(api, shop):
    import jwt as pyjwt
    tok = pyjwt.encode({"sub": str(shop.owner.id), "type": "staff", "tenant_id": shop.tenant.id},
                       "wrong-secret-wrong-secret-wrong-secret", algorithm="HS256")
    assert (await api.get("/api/auth/me", slug="alfa", token=tok)).status_code == 401


async def test_token_types_are_not_interchangeable(api, shop, platform_admin):
    staff_t = shop.owner_token
    cust_t = mint_customer_token(shop.tenant.id, "5550001111")
    plat_t = mint_platform_token(platform_admin)

    # staff token: müşteri ve platform route'larında geçersiz
    assert (await api.get("/api/customer/appointments", slug="alfa", token=staff_t)).status_code == 401
    assert (await api.get("/api/platform/me", token=staff_t)).status_code == 401
    assert (await api.get("/api/platform/billing/overview", token=staff_t)).status_code == 401
    # customer token: personel ve platform route'larında geçersiz
    assert (await api.get("/api/auth/me", slug="alfa", token=cust_t)).status_code == 401
    assert (await api.get("/api/admin/dashboard", slug="alfa", token=cust_t)).status_code == 401
    assert (await api.get("/api/platform/stats", token=cust_t)).status_code == 401
    # platform token: personel ve müşteri route'larında geçersiz
    assert (await api.get("/api/auth/me", slug="alfa", token=plat_t)).status_code == 401
    assert (await api.get("/api/admin/reports/revenue", slug="alfa", token=plat_t)).status_code == 401
    assert (await api.get("/api/customer/appointments", slug="alfa", token=plat_t)).status_code == 401
    # her tip kendi route'unda çalışır
    assert (await api.get("/api/platform/me", token=plat_t)).status_code == 200
    assert (await api.get("/api/customer/appointments", slug="alfa", token=cust_t)).status_code == 200
    assert (await api.get("/api/auth/me", slug="alfa", token=staff_t)).status_code == 200


async def test_customer_token_without_phone_rejected(api, shop):
    tok = create_access_token({"type": "customer", "tenant_id": shop.tenant.id})
    assert (await api.get("/api/customer/appointments", slug="alfa", token=tok)).status_code == 401


async def test_deleted_staff_token_rejected(api, shop):
    r = await api.delete(f"/api/admin/staff/{shop.staff2.id}", slug="alfa", token=shop.owner_token)
    assert r.status_code == 204
    assert (await api.get("/api/auth/me", slug="alfa", token=shop.staff2_token)).status_code == 401


# ----------------------------------------------------------------------------- pasif işletme
async def test_inactive_tenant_blocks_public_and_staff_routes(api, shop):
    async with SessionFactory() as db:
        t = await db.get(type(shop.tenant), shop.tenant.id)
        t.is_active = False
        await db.commit()
    cust = mint_customer_token(shop.tenant.id, "5550001111")
    public = ["/api/public/tenant", "/api/staff", "/api/services",
              f"/api/availability?staff_id={shop.staff.id}&service_id={shop.cut.id}&date={tomorrow()}"]
    for p in public:
        r = await api.get(p, slug="alfa")
        assert r.status_code == 403, p
    assert (await api.post("/api/auth/send-code", slug="alfa", json={"phone": "5550001111"})).status_code == 403
    assert (await api.get("/api/customer/appointments", slug="alfa", token=cust)).status_code == 403
    # personel: giriş de mevcut token da 403
    r = await api.post("/api/auth/login", slug="alfa", json={"phone": shop.owner.phone, "password": PASSWORD})
    assert r.status_code == 403
    assert (await api.get("/api/admin/dashboard", slug="alfa", token=shop.owner_token)).status_code == 403
    assert (await api.get("/api/auth/me", slug="alfa", token=shop.owner_token)).status_code == 403


async def test_inactive_tenant_does_not_affect_other_tenants(api, shop, shop2):
    async with SessionFactory() as db:
        t = await db.get(type(shop.tenant), shop.tenant.id)
        t.is_active = False
        await db.commit()
    assert (await api.get("/api/public/tenant", slug="beta")).status_code == 200
    assert (await api.get("/api/admin/dashboard", slug="beta", token=shop2.owner_token)).status_code == 200
