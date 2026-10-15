"""Çok kiracılı izolasyon: bir işletmenin verisine/token'ına diğerinden erişilemez."""
from datetime import timedelta

from tests.factories import *  # noqa
from tests.helpers import *  # noqa
from datetime import date, time, timedelta  # noqa
from app.core.database import SessionFactory  # noqa
from app.core.security import create_access_token  # noqa
from app.models.appointment import AppointmentStatus  # noqa


async def test_unknown_tenant_host_404(api):
    r = await api.get("/api/public/tenant", slug="yok-boyle-isletme")
    assert r.status_code == 404


async def test_foreign_domain_host_400(api):
    r = await api.get("/api/public/tenant", headers={"Host": "evil.example.com"})
    assert r.status_code == 400


async def test_public_data_scoped_to_host(api, shop, shop2):
    a = (await api.get("/api/public/tenant", slug="alfa")).json()
    b = (await api.get("/api/public/tenant", slug="beta")).json()
    assert a["slug"] == "alfa" and b["slug"] == "beta"
    sa = (await api.get("/api/services", slug="alfa")).json()
    assert {s["id"] for s in sa} == {shop.cut.id, shop.cut_beard.id}
    staff_a = (await api.get("/api/staff", slug="alfa")).json()
    assert {s["id"] for s in staff_a} == {shop.owner.id, shop.staff.id, shop.staff2.id}
    assert all("phone" not in s and "tenant_id" not in s for s in staff_a)  # herkese açık listede telefon yok


async def test_staff_token_from_other_tenant_rejected_on_host(api, shop, shop2):
    """alfa'nın token'ı beta.<domain> üzerinde 401."""
    r = await api.get("/api/auth/me", slug="beta", token=shop.owner_token)
    assert r.status_code == 401
    r = await api.get("/api/admin/dashboard", slug="beta", token=shop.owner_token)
    assert r.status_code == 401
    # kendi host'unda çalışır
    assert (await api.get("/api/auth/me", slug="alfa", token=shop.owner_token)).status_code == 200


async def test_customer_token_from_other_tenant_rejected(api, shop, shop2):
    tok = mint_customer_token(shop.tenant.id, "5559998877")
    r = await api.get("/api/customer/appointments", slug="beta", token=tok)
    assert r.status_code == 401
    assert (await api.get("/api/customer/appointments", slug="alfa", token=tok)).status_code == 200


async def test_staff_login_only_works_on_own_tenant(api, shop, shop2):
    # alfa personeli beta host'unda aynı telefon+şifre ile girmeye çalışır: beta'da böyle bir kullanıcı yok
    # (aynı telefon beta'da ayrı bir kullanıcı olabilir; burada farklı telefon kullanıyoruz)
    await make_staff(shop.tenant.id, "Sadece", "Alfa", "5557776655")
    r = await api.post("/api/auth/login", slug="beta", json={"phone": "5557776655", "password": PASSWORD})
    assert r.status_code == 401
    r = await api.post("/api/auth/login", slug="alfa", json={"phone": "5557776655", "password": PASSWORD})
    assert r.status_code == 200 and r.json()["access_token"]


async def test_cross_tenant_ids_return_404_for_owner(api, shop, shop2):
    """alfa sahibi, beta'nın id'lerine dokunamaz."""
    tok = shop.owner_token
    foreign_staff = shop2.staff.id
    foreign_service = shop2.cut.id
    today = date.today()
    cust = await make_customer(shop2.tenant.id, "5550001122")
    appt = await make_appointment(shop2.tenant.id, cust.id, shop2.staff.id, shop2.cut.id, tomorrow(), time(10, 0))
    pm = await make_payment_method(shop2.tenant.id)
    async with SessionFactory() as db:
        from app.models.time_off import TimeOff
        to = TimeOff(tenant_id=shop2.tenant.id, staff_id=shop2.staff.id, start_date=today, end_date=today)
        db.add(to)
        await db.commit()

    checks = [
        ("PATCH", f"/api/admin/staff/{foreign_staff}", {"name": "Hacked"}),
        ("DELETE", f"/api/admin/staff/{foreign_staff}", None),
        ("PATCH", f"/api/admin/services/{foreign_service}", {"price": 1}),
        ("DELETE", f"/api/admin/services/{foreign_service}", None),
        ("PATCH", f"/api/admin/appointments/{appt.id}", {"status": "cancelled"}),
        ("PATCH", f"/api/admin/payment-methods/{pm.id}", {"name": "X"}),
        ("DELETE", f"/api/admin/payment-methods/{pm.id}", None),
        ("DELETE", f"/api/admin/time-off/{to.id}", None),
        ("GET", f"/api/admin/working-hours?staff_id={foreign_staff}", None),
        ("PUT", f"/api/admin/working-hours/{foreign_staff}", []),
        ("GET", f"/api/admin/reports/revenue?staff_id={foreign_staff}", None),
        ("POST", "/api/admin/time-off",
         {"staff_id": foreign_staff, "start_date": today.isoformat(), "end_date": today.isoformat()}),
        ("POST", "/api/admin/appointments",
         {"phone": "5550003344", "name": "a", "surname": "b", "staff_id": foreign_staff,
          "service_id": shop.cut.id, "appointment_date": tomorrow().isoformat(), "appointment_time": "10:00"}),
        ("POST", "/api/admin/appointments",
         {"phone": "5550003344", "name": "a", "surname": "b", "staff_id": shop.staff.id,
          "service_id": foreign_service, "appointment_date": tomorrow().isoformat(), "appointment_time": "10:00"}),
    ]
    for method, path, body in checks:
        r = await api.request(method, path, slug="alfa", token=tok, json=body) if body is not None \
            else await api.request(method, path, slug="alfa", token=tok)
        assert r.status_code == 404, f"{method} {path} -> {r.status_code} {r.text}"

    # beta'nın verisi değişmedi
    async with SessionFactory() as db:
        from sqlalchemy import select
        from app.models.service import Service
        from app.models.staff import Staff
        from app.models.appointment import Appointment
        assert (await db.get(Staff, foreign_staff)).name == "Berber"
        assert (await db.get(Service, foreign_service)).price == 200
        assert (await db.get(Appointment, appt.id)).status == AppointmentStatus.CONFIRMED


async def test_lists_never_leak_other_tenant_rows(api, shop, shop2):
    await make_customer(shop2.tenant.id, "5550001122", "Gizli", "Musteri")
    await make_payment_method(shop2.tenant.id, "BetaOzel")
    tok = shop.owner_token
    customers = (await api.get("/api/admin/customers", slug="alfa", token=tok)).json()
    assert customers == []
    staff = (await api.get("/api/admin/staff", slug="alfa", token=tok)).json()
    assert {s["id"] for s in staff} == {shop.owner.id, shop.staff.id, shop.staff2.id}
    services = (await api.get("/api/admin/services", slug="alfa", token=tok)).json()
    assert {s["id"] for s in services} == {shop.cut.id, shop.cut_beard.id}
    pms = (await api.get("/api/admin/payment-methods", slug="alfa", token=tok)).json()
    assert pms == []
    appts = (await api.get("/api/admin/appointments", slug="alfa", token=tok)).json()
    assert appts == []


async def test_booking_with_other_tenants_staff_or_service_404(api, shop, shop2):
    tok = mint_customer_token(shop.tenant.id, "5550007788")
    base = {"name": "ali", "surname": "veli", "appointment_date": tomorrow().isoformat(), "appointment_time": "10:00"}
    r = await api.post("/api/appointments", slug="alfa", token=tok,
                       json={**base, "staff_id": shop2.staff.id, "service_id": shop.cut.id})
    assert r.status_code == 404
    r = await api.post("/api/appointments", slug="alfa", token=tok,
                       json={**base, "staff_id": shop.staff.id, "service_id": shop2.cut.id})
    assert r.status_code == 404


async def test_same_customer_phone_in_two_tenants_is_independent(api, shop, shop2):
    phone = "5550001234"
    for s, slug in ((shop, "alfa"), (shop2, "beta")):
        tok = mint_customer_token(s.tenant.id, phone)
        r = await api.post("/api/appointments", slug=slug, token=tok, json={
            "name": "ali", "surname": "veli", "staff_id": s.staff.id, "service_id": s.cut.id,
            "appointment_date": tomorrow().isoformat(), "appointment_time": "10:00"})
        assert r.status_code == 200, r.text
    mine_a = (await api.get("/api/customer/appointments", slug="alfa",
                            token=mint_customer_token(shop.tenant.id, phone))).json()
    assert len(mine_a) == 1 and mine_a[0]["staff"]["id"] == shop.staff.id
    # alfa randevusunu beta token'ıyla iptal edemez
    r = await api.post(f"/api/customer/appointments/{mine_a[0]['id']}/cancel", slug="beta",
                       token=mint_customer_token(shop2.tenant.id, phone))
    assert r.status_code == 404


async def test_customer_cannot_cancel_someone_elses_appointment(api, shop):
    c1 = await make_customer(shop.tenant.id, "5550001111")
    appt = await make_appointment(shop.tenant.id, c1.id, shop.staff.id, shop.cut.id,
                                  date.today() + timedelta(days=3), time(10, 0))
    other = mint_customer_token(shop.tenant.id, "5550002222")
    r = await api.post(f"/api/customer/appointments/{appt.id}/cancel", slug="alfa", token=other)
    assert r.status_code == 404
    mine = mint_customer_token(shop.tenant.id, "5550001111")
    r = await api.post(f"/api/customer/appointments/{appt.id}/cancel", slug="alfa", token=mine)
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
