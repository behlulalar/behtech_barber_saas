"""'Bugün kapalıyım' tek tuşu: tüm personeli o gün kapatır, randevuları iptal etmez, geri açılır."""
from datetime import date

from sqlalchemy import select

from app.core.database import SessionFactory
from app.models.time_off import TimeOff
from tests.factories import *  # noqa
from tests.helpers import *  # noqa

DAY = tomorrow()


async def post(api, shop, day=DAY, token=None):
    return await api.post("/api/admin/closures", slug=shop.slug, token=token or shop.owner_token, json={"date": day.isoformat()})


async def status(api, shop, day=DAY):
    return (await api.get(f"/api/admin/closures?date={day}", slug=shop.slug, token=shop.owner_token)).json()


async def test_close_blocks_booking_and_reopen_restores(api, shop):
    assert (await status(api, shop))["closed"] is False
    c = await make_customer(shop.tenant.id, "5321110000")
    await make_appointment(shop.tenant.id, c.id, shop.staff.id, shop.cut.id, DAY, time(11, 0))
    r = await post(api, shop)
    assert r.status_code == 201 and r.json()["closed"] is True and r.json()["confirmed_appointments"] == 1
    g = (await api.get(f"/api/availability/slots?service_id={shop.cut.id}&date={DAY}", slug=shop.slug)).json()  # fark etmez
    assert g["closed_reason"] == "time_off" and g["slots"] == []
    tok = mint_customer_token(shop.tenant.id, "5550001111")
    r = await api.post("/api/appointments", slug=shop.slug, token=tok, json={
        "name": "a", "surname": "b", "staff_id": shop.staff.id, "service_id": shop.cut.id,
        "appointment_date": DAY.isoformat(), "appointment_time": "14:00"})
    assert r.status_code == 409
    r = await api.delete(f"/api/admin/closures?date={DAY}", slug=shop.slug, token=shop.owner_token)
    assert r.status_code == 200 and r.json()["closed"] is False and r.json()["confirmed_appointments"] == 1  # randevu hiç iptal edilmedi


async def test_idempotent_and_reopen_keeps_manual_leave(api, shop):
    # personelin kendi tüm gün izni olan gün: kapatma tekrarlanır, aç yalnızca kapatmanın izinlerini siler
    await api.post("/api/admin/time-off", slug=shop.slug, token=shop.owner_token,
                   json={"staff_id": shop.staff.id, "start_date": DAY.isoformat(), "end_date": DAY.isoformat(), "reason": "Doktor"})
    assert (await post(api, shop)).json()["closed"] is True
    assert (await post(api, shop)).json()["closed"] is True  # ikinci tıklama zarar vermez
    async with SessionFactory() as db:
        rows = (await db.execute(select(TimeOff).where(TimeOff.tenant_id == shop.tenant.id))).scalars().all()
    assert len(rows) == 3  # Doktor izni + (owner, staff2) için kapatma izinleri
    r = await api.delete(f"/api/admin/closures?date={DAY}", slug=shop.slug, token=shop.owner_token)
    assert r.json()["closed"] is False
    async with SessionFactory() as db:
        rows = (await db.execute(select(TimeOff).where(TimeOff.tenant_id == shop.tenant.id))).scalars().all()
    assert [x.reason for x in rows] == ["Doktor"]


async def test_permissions_and_validation(api, shop, shop2):
    assert (await post(api, shop, token=shop.staff_token)).status_code == 403  # personel kapatamaz
    assert (await api.post("/api/admin/closures", slug=shop.slug, json={"date": str(DAY)})).status_code == 401
    assert (await post(api, shop, day=date(2020, 1, 1))).status_code == 400  # geçmiş gün
    await post(api, shop)
    assert (await status(api, shop2))["closed"] is False  # başka işletme etkilenmez


async def test_site_link_and_qr(api, shop):
    r = await api.get("/api/admin/site-link", slug=shop.slug, token=shop.owner_token)
    assert r.status_code == 200
    d = r.json()
    assert d["url"].startswith("http") and shop.slug in d["url"] and not d["url"].endswith("/randevu")
    assert d["qr"].startswith("data:image/svg+xml;base64,")
    assert (await api.get("/api/admin/site-link", slug=shop.slug, token=shop.staff_token)).status_code == 403  # yalnızca yönetici
