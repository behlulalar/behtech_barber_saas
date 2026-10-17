"""Saat aralıklı izin: motor (slotlar kapanır), doğrulama, çakışma uyarısı, tüm gün izinle birlikte çalışma."""
from datetime import date, time, timedelta

import pytest
from sqlalchemy import select

from app.core.database import SessionFactory
from app.models.time_off import TimeOff
from tests.factories import *  # noqa
from tests.helpers import *  # noqa

DAY = date.today() + timedelta(days=3)


async def add_off(api, shop, **kw):
    body = {"staff_id": shop.staff.id, "start_date": DAY.isoformat(), "end_date": DAY.isoformat(), **kw}
    return await api.post("/api/admin/time-off", slug="alfa", token=shop.owner_token, json=body)


async def slots(api, shop, service=None, day=DAY):
    s = service or shop.cut
    r = await api.get(f"/api/availability/slots?staff_id={shop.staff.id}&service_id={s.id}&date={day}", slug="alfa")
    assert r.status_code == 200, r.text
    return r.json()


def by_start(grid):
    return {s["start"]: s for s in grid["slots"]}


async def test_partial_time_off_closes_only_those_slots(api, shop):
    r = await add_off(api, shop, start_time="12:00:00", end_time="13:00:00", reason="Öğle arası")
    assert r.status_code == 201 and r.json()["start_time"] == "12:00:00" and r.json()["end_time"] == "13:00:00"
    g = await slots(api, shop)
    assert g["closed_reason"] is None  # gün kapalı DEĞİL
    s = by_start(g)
    assert s["12:00"]["status"] == "off" and s["12:30"]["status"] == "off"
    assert not s["12:00"]["bookable"] and not s["12:30"]["bookable"]
    assert s["11:30"]["status"] == "free" and s["13:00"]["status"] == "free"
    assert s["11:30"]["bookable"] and s["13:00"]["bookable"]


async def test_long_service_cannot_overlap_the_closed_window(api, shop):
    await add_off(api, shop, start_time="12:00:00", end_time="13:00:00")
    s = by_start(await slots(api, shop, service=shop.cut_beard))  # 60 dk = 2 slot
    assert s["11:00"]["bookable"]  # 11:00-12:00 sığar
    assert not s["11:30"]["bookable"]  # 11:30-12:30 izne taşar
    assert not s["12:30"]["bookable"]
    assert s["13:00"]["bookable"]


async def test_booking_inside_the_window_is_rejected(api, shop):
    await add_off(api, shop, start_time="12:00:00", end_time="13:00:00")
    tok = mint_customer_token(shop.tenant.id, "5550001111")
    body = {"name": "Ali", "surname": "Veli", "staff_id": shop.staff.id, "service_id": shop.cut.id,
            "appointment_date": DAY.isoformat(), "appointment_time": "12:00"}
    assert (await api.post("/api/appointments", slug="alfa", token=tok, json=body)).status_code == 409
    assert (await api.post("/api/appointments", slug="alfa", token=tok, json={**body, "appointment_time": "13:00"})).status_code == 200


async def test_window_applies_to_every_day_of_a_date_range(api, shop):
    end = DAY + timedelta(days=2)
    await add_off(api, shop, end_date=end.isoformat(), start_time="10:00:00", end_time="11:00:00")
    for d in (DAY, DAY + timedelta(days=1), end):
        assert by_start(await slots(api, shop, day=d))["10:00"]["status"] == "off", d
    assert by_start(await slots(api, shop, day=end + timedelta(days=1)))["10:00"]["status"] == "free"


async def test_end_of_day_window_with_midnight_end(api, shop):
    await add_off(api, shop, start_time="17:00:00", end_time="00:00:00")
    s = by_start(await slots(api, shop))
    assert s["16:30"]["status"] == "free" and s["17:00"]["status"] == "off" and s["17:30"]["status"] == "off"


async def test_full_day_time_off_still_closes_the_day(api, shop):
    r = await add_off(api, shop)  # saat yok = tüm gün
    assert r.status_code == 201 and r.json()["start_time"] is None
    assert (await slots(api, shop))["closed_reason"] == "time_off"
    # tüm gün + saat aralıklı birlikte: tüm gün kazanır
    await add_off(api, shop, start_time="12:00:00", end_time="13:00:00")
    assert (await slots(api, shop))["closed_reason"] == "time_off"


@pytest.mark.parametrize("extra,status", [
    ({"start_time": "12:00:00"}, 422),  # yalnızca biri
    ({"end_time": "13:00:00"}, 422),
    ({"start_time": "13:00:00", "end_time": "12:00:00"}, 422),  # ters
    ({"start_time": "12:00:00", "end_time": "12:00:00"}, 422),  # boş
    ({"start_time": "12:15:00", "end_time": "13:00:00"}, 422),  # ızgara dışı
    ({"start_time": "12:00:00", "end_time": "13:10:00"}, 422),
    ({"start_time": "00:00:00", "end_time": "00:00:00"}, 422),  # tüm gün gibi, boş bırakılmalı
    ({"start_time": "12:00:00", "end_time": "13:00:00"}, 201),
])
async def test_validation(api, shop, extra, status):
    assert (await add_off(api, shop, **extra)).status_code == status


async def test_conflict_warning_counts_existing_appointments_but_does_not_cancel(api, shop):
    cust = await make_customer(shop.tenant.id, "5550002222")
    inside = await make_appointment(shop.tenant.id, cust.id, shop.staff.id, shop.cut.id, DAY, time(12, 30))
    overlap = await make_appointment(shop.tenant.id, cust.id, shop.staff.id, shop.cut_beard.id, DAY, time(11, 30))  # 11:30-12:30 taşar
    outside = await make_appointment(shop.tenant.id, cust.id, shop.staff.id, shop.cut.id, DAY, time(15, 0))
    r = await add_off(api, shop, start_time="12:00:00", end_time="13:00:00")
    assert r.json()["conflicting_appointments"] == 2  # 12:30 ve 11:30(60 dk); 15:00 çakışmaz
    full = await add_off(api, shop)
    assert full.json()["conflicting_appointments"] == 3  # tüm gün: hepsi
    from app.models.appointment import Appointment
    async with SessionFactory() as db:
        statuses = {a.status.value for a in (await db.execute(select(Appointment))).scalars()}
    assert statuses == {"confirmed"}  # hiçbiri iptal edilmedi


async def test_list_returns_times_and_staff_cannot_create(api, shop):
    await add_off(api, shop, start_time="09:00:00", end_time="10:00:00")
    rows = (await api.get(f"/api/admin/time-off?staff_id={shop.staff.id}", slug="alfa", token=shop.owner_token)).json()
    assert rows[0]["start_time"] == "09:00:00" and rows[0]["end_time"] == "10:00:00" and rows[0]["conflicting_appointments"] == 0
    r = await api.post("/api/admin/time-off", slug="alfa", token=shop.staff_token, json={
        "staff_id": shop.staff.id, "start_date": DAY.isoformat(), "end_date": DAY.isoformat(), "start_time": "09:00:00", "end_time": "10:00:00"})
    assert r.status_code == 403


async def test_db_rejects_half_filled_pair(shop):
    from sqlalchemy.exc import IntegrityError
    async with SessionFactory() as db:
        db.add(TimeOff(tenant_id=shop.tenant.id, staff_id=shop.staff.id, start_date=DAY, end_date=DAY, start_time=time(12, 0)))
        with pytest.raises(IntegrityError):
            await db.commit()
