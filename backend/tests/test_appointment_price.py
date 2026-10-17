"""Randevu anındaki fiyat: hizmet fiyatı sonradan değişince geçmiş randevu ve rapor değişmez."""
from datetime import date, timedelta

from sqlalchemy import select, update

from app.core.database import SessionFactory
from app.models.appointment import Appointment, AppointmentStatus
from app.models.service import Service
from tests.factories import *  # noqa
from tests.helpers import *  # noqa

DAY = tomorrow()


async def set_price(service, price):
    async with SessionFactory() as db:
        await db.execute(update(Service).where(Service.id == service.id).values(price=price))
        await db.commit()


async def stored_price(appt_id):
    async with SessionFactory() as db:
        return (await db.execute(select(Appointment.price).where(Appointment.id == appt_id))).scalar_one()


async def book_public(api, shop, at, phone):
    r = await api.post("/api/appointments", slug=shop.slug, token=mint_customer_token(shop.tenant.id, phone), json={
        "name": "a", "surname": "b", "staff_id": shop.staff.id, "service_id": shop.cut.id,
        "appointment_date": DAY.isoformat(), "appointment_time": at})
    assert r.status_code == 200, r.text
    return r.json()


async def test_public_booking_stores_price_and_keeps_it_after_service_price_change(api, shop):
    a = await book_public(api, shop, "10:00", "5550001111")  # hizmet fiyatı 200
    assert a["service"]["price"] == 200 and await stored_price(a["id"]) == 200
    await set_price(shop.cut, 500)  # zam
    mine = (await api.get("/api/customer/appointments", slug=shop.slug, token=mint_customer_token(shop.tenant.id, "5550001111"))).json()
    assert mine[0]["service"]["price"] == 200  # müşteri o günkü fiyatı görür
    b = await book_public(api, shop, "11:00", "5550002222")
    assert b["service"]["price"] == 500 and await stored_price(b["id"]) == 500  # yeni randevu yeni fiyat


async def test_admin_created_appointment_stores_price_and_lists_it(api, shop):
    r = await api.post("/api/admin/appointments", slug=shop.slug, token=shop.owner_token, json={
        "phone": "5321110000", "name": "Ali", "surname": "Veli", "staff_id": shop.staff.id, "service_id": shop.cut.id,
        "appointment_date": DAY.isoformat(), "appointment_time": "10:00"})
    assert r.status_code in (200, 201), r.text
    assert r.json()["service"]["price"] == 200
    await set_price(shop.cut, 999)
    got = (await api.get(f"/api/admin/appointments?date_from={DAY}&date_to={DAY}", slug=shop.slug, token=shop.owner_token)).json()
    assert [x["service"]["price"] for x in got] == [200]


async def test_revenue_report_ignores_later_price_change_and_falls_back_for_legacy_rows(api, shop):
    c = await make_customer(shop.tenant.id, "5321112222")
    day = date.today() - timedelta(days=1)
    async with SessionFactory() as db:
        for at, price in ((time(10, 0), 200), (time(11, 0), None)):  # biri fiyatlı, biri eski kayıt (NULL)
            db.add(Appointment(tenant_id=shop.tenant.id, customer_id=c.id, staff_id=shop.staff.id, service_id=shop.cut.id,
                               appointment_date=day, appointment_time=at, status=AppointmentStatus.COMPLETED, price=price))
        await db.commit()
    await set_price(shop.cut, 1000)
    r = await api.get(f"/api/admin/reports/revenue?period=day&date={day}", slug=shop.slug, token=shop.owner_token)
    assert r.status_code == 200, r.text
    total = r.json()["summary"]["revenue"] if "summary" in r.json() else r.json().get("revenue")
    assert total == 200 + 1000  # kayıtlı 200 değişmedi; NULL satır güncel fiyata (1000) düştü
