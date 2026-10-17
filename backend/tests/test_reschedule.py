"""Müşterinin randevusunu başka saate alması."""
from datetime import datetime, timedelta

from sqlalchemy import select

from app.core.database import SessionFactory
from app.models.appointment import Appointment, AppointmentStatus
from app.models.outbound_message import OutboundMessage
from tests.factories import *  # noqa
from tests.helpers import *  # noqa

DAY = tomorrow()
PHONE = "5550001111"


def tok(shop, phone=PHONE):
    return mint_customer_token(shop.tenant.id, phone)


async def create(api, shop, at="10:00", service=None, staff=None, phone=PHONE):
    r = await api.post("/api/appointments", slug=shop.slug, token=tok(shop, phone), json={
        "name": "Ali", "surname": "Veli", "staff_id": (staff or shop.staff).id, "service_id": (service or shop.cut).id,
        "appointment_date": DAY.isoformat(), "appointment_time": at})
    assert r.status_code == 200, r.text
    return r.json()


async def move(api, shop, appt_id, at, day=DAY, phone=PHONE):
    return await api.post(f"/api/customer/appointments/{appt_id}/reschedule", slug=shop.slug, token=tok(shop, phone),
                          json={"appointment_date": day.isoformat(), "appointment_time": at})


async def test_reschedule_moves_same_row_and_frees_old_slot(api, shop):
    a = await create(api, shop, "10:00")
    r = await move(api, shop, a["id"], "14:00")
    assert r.status_code == 200, r.text
    assert r.json()["id"] == a["id"] and r.json()["appointment_time"].startswith("14:00") and r.json()["status"] == "confirmed"
    # eski saat boşaldı: başkası alabilir, kendisi yeniden alabilir
    await create(api, shop, "10:00", phone="5550002222")


async def test_long_service_can_shift_into_its_own_overlap(api, shop):
    a = await create(api, shop, "10:00", service=shop.cut_beard)  # 60 dk: 10:00-11:00
    r = await move(api, shop, a["id"], "10:30")  # kendi kaplamasıyla örtüşen yeni saat
    assert r.status_code == 200, r.text


async def test_taken_slot_is_409_and_original_untouched(api, shop):
    a = await create(api, shop, "10:00")
    await create(api, shop, "11:00", phone="5550002222")
    r = await move(api, shop, a["id"], "11:00")
    assert r.status_code == 409
    async with SessionFactory() as db:
        row = (await db.execute(select(Appointment).where(Appointment.id == a["id"]))).scalar_one()
    assert row.appointment_time.hour == 10 and row.status == AppointmentStatus.CONFIRMED


async def test_rules(api, shop):
    a = await create(api, shop, "10:00")
    assert (await move(api, shop, a["id"], "10:00")).status_code == 400  # aynı saat
    assert (await move(api, shop, a["id"], "09:00", day=DAY - timedelta(days=3))).status_code == 400  # geçmiş
    assert (await move(api, shop, a["id"], "20:00")).status_code == 409  # çalışma saati dışı
    assert (await move(api, shop, a["id"], "11:00", phone="5550009999")).status_code == 404  # başkasının randevusu
    assert (await api.post(f"/api/customer/appointments/{a['id']}/reschedule", slug=shop.slug,
                           json={"appointment_date": str(DAY), "appointment_time": "11:00"})).status_code == 401
    await api.post(f"/api/customer/appointments/{a['id']}/cancel", slug=shop.slug, token=tok(shop))
    assert (await move(api, shop, a["id"], "11:00")).status_code == 400  # iptal edilmiş


async def test_too_close_to_start_is_400(api, shop):
    soon = datetime.now() + timedelta(minutes=45)
    c = await make_customer(shop.tenant.id, PHONE)
    a = await make_appointment(shop.tenant.id, c.id, shop.staff.id, shop.cut.id, soon.date(), soon.time().replace(second=0, microsecond=0))
    r = await api.post(f"/api/customer/appointments/{a.id}/reschedule", slug=shop.slug, token=tok(shop),
                       json={"appointment_date": str(DAY), "appointment_time": "15:00"})
    assert r.status_code == 400


async def test_notifications_replace_stale_messages(api, shop):
    await connect_whatsapp(shop.tenant.id)
    a = await create(api, shop, "10:00")
    async def msgs():
        async with SessionFactory() as db:
            return (await db.execute(select(OutboundMessage).order_by(OutboundMessage.id))).scalars().all()
    before = {m.kind for m in await msgs() if m.status == "pending"}
    assert {"confirm", "staff_new"} <= before
    assert (await move(api, shop, a["id"], "14:30")).status_code == 200
    rows = await msgs()
    assert all(m.status == "cancelled" for m in rows if m.kind in ("confirm", "staff_new"))  # eski saati yazan mesajlar gitmez
    new = [m for m in rows if m.status == "pending"]
    assert {m.kind for m in new} == {"reschedule_customer", "staff_reschedule"}
    cust = next(m for m in new if m.kind == "reschedule_customer")
    assert "14:30" in cust.body  # yeni saat her alternatifte yazar (eski saat yalnızca bazılarında)


async def test_booking_and_reschedule_racing_for_same_slot_only_one_wins(api, shop):
    import asyncio
    for round_, at in enumerate(("14:00", "15:00", "16:00")):
        a = await create(api, shop, "09:00" if round_ == 0 else ("09:30" if round_ == 1 else "10:00"), phone=f"55500100{round_:02d}")
        res = await asyncio.gather(
            move(api, shop, a["id"], at, phone=f"55500100{round_:02d}"),
            api.post("/api/appointments", slug=shop.slug, token=tok(shop, f"55500200{round_:02d}"), json={
                "name": "Yeni", "surname": "Kisi", "staff_id": shop.staff.id, "service_id": shop.cut.id,
                "appointment_date": DAY.isoformat(), "appointment_time": at}),
        )
        assert sorted(r.status_code for r in res) == [200, 409], [r.text for r in res]
