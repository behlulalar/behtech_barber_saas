"""Randevu motoru: 30 dk ızgara, çakışma, eşzamanlılık, gün sonu, iptal sonrası yeniden alma."""
import asyncio
from datetime import date, time, timedelta

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.database import SessionFactory
from app.models.appointment import Appointment, AppointmentStatus
from app.models.customer import Customers
from tests.factories import *  # noqa
from tests.helpers import *  # noqa

DAY = tomorrow()


def body(shop, at="10:00", service=None, staff=None, day=DAY, name="ali", surname="veli"):
    return {
        "name": name, "surname": surname,
        "staff_id": (staff or shop.staff).id, "service_id": (service or shop.cut).id,
        "appointment_date": day.isoformat(), "appointment_time": at,
    }


async def book(api, shop, at="10:00", phone="5550001111", **kw):
    tok = mint_customer_token(shop.tenant.id, phone)
    return await api.post("/api/appointments", slug=shop.slug, token=tok, json=body(shop, at=at, **kw))


async def slots(api, shop, service=None, staff=None, day=DAY):
    s, st = service or shop.cut, staff or shop.staff
    r = await api.get(f"/api/availability/slots?staff_id={st.id}&service_id={s.id}&date={day}", slug=shop.slug)
    assert r.status_code == 200, r.text
    return r.json()


async def test_grid_has_only_half_hour_starts(api, shop):
    g = await slots(api, shop)
    assert g["slot_minutes"] == 30 and g["duration_slots"] == 1 and g["closed_reason"] is None
    starts = [s["start"] for s in g["slots"]]
    assert starts[0] == "09:00" and starts[-1] == "17:30" and len(starts) == 18
    assert all(s.endswith(":00") or s.endswith(":30") for s in starts)
    assert all(s["bookable"] and s["status"] == "free" for s in g["slots"])
    legacy = (await api.get(f"/api/availability?staff_id={shop.staff.id}&service_id={shop.cut.id}&date={DAY}",
                            slug="alfa")).json()
    assert [t[:5] for t in legacy] == starts


async def test_sixty_minute_service_occupies_two_slots(api, shop):
    g = await slots(api, shop, service=shop.cut_beard)
    assert g["duration_slots"] == 2
    by = {s["start"]: s for s in g["slots"]}
    assert by["17:00"]["bookable"] is True
    assert by["17:30"]["bookable"] is False and by["17:30"]["status"] == "free"  # 2. slot yok
    r = await book(api, shop, "10:00", service=shop.cut_beard)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "confirmed" and r.json()["service"]["duration_min"] == 60
    by = {s["start"]: s for s in (await slots(api, shop))["slots"]}
    assert by["10:00"]["status"] == "busy" and by["10:30"]["status"] == "busy"
    assert by["09:30"]["status"] == "free" and by["11:00"]["status"] == "free"
    # 09:30 + 60 dk, 10:00 ile çakışır
    by60 = {s["start"]: s for s in (await slots(api, shop, service=shop.cut_beard))["slots"]}
    assert by60["09:30"]["bookable"] is False and by60["09:00"]["bookable"] is True
    assert by60["10:30"]["bookable"] is False and by60["11:00"]["bookable"] is True


async def test_quarter_hour_start_rejected_409(api, shop):
    r = await book(api, shop, "10:15")
    assert r.status_code == 409
    assert (await book(api, shop, "10:45")).status_code == 409
    async with SessionFactory() as db:
        assert (await db.execute(select(Appointment))).first() is None


async def test_time_with_seconds_is_normalized(api, shop):
    r = await book(api, shop, "10:00:00")
    assert r.status_code == 200 and r.json()["appointment_time"].startswith("10:00")


async def test_overlap_conflicts_409(api, shop):
    assert (await book(api, shop, "10:00", service=shop.cut_beard)).status_code == 200   # 10:00-11:00
    assert (await book(api, shop, "10:00", phone="5550002222")).status_code == 409        # aynı saat
    assert (await book(api, shop, "10:30", phone="5550002222")).status_code == 409        # içine denk
    assert (await book(api, shop, "09:30", phone="5550002222", service=shop.cut_beard)).status_code == 409  # sondan örtüşme
    assert (await book(api, shop, "11:00", phone="5550002222")).status_code == 200        # hemen sonrası serbest
    assert (await book(api, shop, "09:30", phone="5550003333")).status_code == 200        # hemen öncesi serbest
    # farklı berber aynı saatte serbest
    assert (await book(api, shop, "10:00", phone="5550004444", staff=shop.staff2)).status_code == 200


async def test_concurrent_booking_same_slot_exactly_one_wins(api, shop):
    reqs = [book(api, shop, "14:00", phone=f"55500011{i:02d}") for i in range(2)]
    res = await asyncio.gather(*reqs)
    assert sorted(r.status_code for r in res) == [200, 409]
    async with SessionFactory() as db:
        n = len((await db.execute(select(Appointment).where(Appointment.status != AppointmentStatus.CANCELLED))).all())
        assert n == 1


async def test_concurrent_overlapping_bookings_exactly_one_wins(api, shop):
    """14:00-15:00 (60 dk) ile 14:30 (30 dk) aynı anda: unique index tek başına yakalayamaz, berber kilidi gerekir."""
    res = await asyncio.gather(
        book(api, shop, "14:00", service=shop.cut_beard, phone="5550001101"),
        book(api, shop, "14:30", service=shop.cut, phone="5550001102"),
    )
    assert sorted(r.status_code for r in res) == [200, 409]


async def test_many_concurrent_requests_one_slot(api, shop):
    res = await asyncio.gather(*[book(api, shop, "15:00", phone=f"55500022{i:02d}") for i in range(6)])
    codes = sorted(r.status_code for r in res)
    assert codes == [200] + [409] * 5


async def test_midnight_end_counts_as_end_of_day(api, shop):
    # 20:00-00:00 çalışan berber: son slot 23:30, bitişi "24:00"
    st = await make_staff(shop.tenant.id, "Gece", "Berberi", "5553334455")
    await link_staff_service(shop.tenant.id, st.id, shop.cut.id)
    await link_staff_service(shop.tenant.id, st.id, shop.cut_beard.id)
    await set_working_hours(shop.tenant.id, st.id, start=time(20, 0), end=time(0, 0))
    g = await slots(api, shop, staff=st)
    starts = [s["start"] for s in g["slots"]]
    assert starts[0] == "20:00" and starts[-1] == "23:30" and len(starts) == 8
    assert g["slots"][-1]["end"] == "24:00"
    assert g["slots"][-1]["bookable"] is True
    # 60 dk hizmet 23:30'a sığmaz, 23:00'a sığar
    g60 = {s["start"]: s["bookable"] for s in (await slots(api, shop, service=shop.cut_beard, staff=st))["slots"]}
    assert g60["23:00"] is True and g60["23:30"] is False
    assert (await book(api, shop, "23:30", staff=st)).status_code == 200
    assert (await book(api, shop, "23:30", staff=st, service=shop.cut_beard, phone="5550002222")).status_code == 409


async def test_cancelled_slot_can_be_rebooked(api, shop):
    tok1 = mint_customer_token(shop.tenant.id, "5550001111")
    first = await api.post("/api/appointments", slug="alfa", token=tok1, json=body(shop, "11:00"))
    assert first.status_code == 200
    again = await book(api, shop, "11:00", phone="5550002222")
    assert again.status_code == 409
    c = await api.post(f"/api/customer/appointments/{first.json()['id']}/cancel", slug="alfa", token=tok1)
    assert c.status_code == 200 and c.json()["status"] == "cancelled"
    # slot yeniden açık
    by = {s["start"]: s for s in (await slots(api, shop))["slots"]}
    assert by["11:00"]["status"] == "free"
    again = await book(api, shop, "11:00", phone="5550002222")
    assert again.status_code == 200
    async with SessionFactory() as db:
        rows = (await db.execute(select(Appointment.status).where(Appointment.appointment_time == time(11, 0)))).scalars().all()
        assert sorted(s.value for s in rows) == ["cancelled", "confirmed"]  # iptal kaydı geçmiş olarak kaldı


async def test_partial_unique_index_enforced_in_db(shop):
    """Aynı (berber, gün, saat) için iki AKTİF kayıt DB düzeyinde de engellenir; iptal edilen sayılmaz."""
    c = await make_customer(shop.tenant.id, "5550001111")
    await make_appointment(shop.tenant.id, c.id, shop.staff.id, shop.cut.id, DAY, time(10, 0))
    with pytest.raises(IntegrityError):
        await make_appointment(shop.tenant.id, c.id, shop.staff.id, shop.cut.id, DAY, time(10, 0))
    # iptal edilmiş olan serbest, çoklu iptal kaydı olabilir
    await make_appointment(shop.tenant.id, c.id, shop.staff.id, shop.cut.id, DAY, time(12, 0), AppointmentStatus.CANCELLED)
    await make_appointment(shop.tenant.id, c.id, shop.staff.id, shop.cut.id, DAY, time(12, 0), AppointmentStatus.CANCELLED)
    await make_appointment(shop.tenant.id, c.id, shop.staff.id, shop.cut.id, DAY, time(12, 0))
    with pytest.raises(IntegrityError):
        await make_appointment(shop.tenant.id, c.id, shop.staff.id, shop.cut.id, DAY, time(12, 0), AppointmentStatus.COMPLETED)


async def test_staff_not_providing_service_is_400(api, shop):
    only_cut = await make_staff(shop.tenant.id, "Sadece", "Kesim", "5553334466")
    await link_staff_service(shop.tenant.id, only_cut.id, shop.cut.id)
    await set_working_hours(shop.tenant.id, only_cut.id)
    r = await api.get(f"/api/availability/slots?staff_id={only_cut.id}&service_id={shop.cut_beard.id}&date={DAY}",
                      slug="alfa")
    assert r.status_code == 400 and "vermiyor" in r.json()["detail"]
    r = await book(api, shop, "10:00", staff=only_cut, service=shop.cut_beard)
    assert r.status_code == 400
    assert (await book(api, shop, "10:00", staff=only_cut, service=shop.cut)).status_code == 200


async def test_past_date_and_past_time_rejected(api, shop):
    r = await book(api, shop, "10:00", day=date.today() - timedelta(days=1))
    assert r.status_code == 400
    r = await book(api, shop, "00:00", day=date.today())  # bugünün 00:00'ı geçmişte
    assert r.status_code == 400
    # geçmiş slotlar listede bookable değil
    g = await slots(api, shop, day=date.today() - timedelta(days=1))
    assert all(not s["bookable"] and s["status"] == "past" for s in g["slots"])


async def test_day_off_and_time_off_block_booking(api, shop):
    st = await make_staff(shop.tenant.id, "Izinli", "Berber", "5553334477")
    await link_staff_service(shop.tenant.id, st.id, shop.cut.id)
    # çalışma saati hiç yok => gün kapalı
    g = await slots(api, shop, staff=st)
    assert g["closed_reason"] == "day_off" and g["slots"] == []
    assert (await book(api, shop, "10:00", staff=st)).status_code == 409
    # izin
    await set_working_hours(shop.tenant.id, st.id)
    assert (await slots(api, shop, staff=st))["closed_reason"] is None
    r = await api.post("/api/admin/time-off", slug="alfa", token=shop.owner_token,
                       json={"staff_id": st.id, "start_date": DAY.isoformat(), "end_date": DAY.isoformat()})
    assert r.status_code == 201
    g = await slots(api, shop, staff=st)
    assert g["closed_reason"] == "time_off"
    assert (await book(api, shop, "10:00", staff=st)).status_code == 409


async def test_working_hours_day_of_week_uses_js_convention(api, shop):
    """0=Pazar. Sadece DAY'in JS gününde açık olan berber o gün müsait, ertesi gün kapalı."""
    st = await make_staff(shop.tenant.id, "Tek", "Gun", "5553334488")
    await link_staff_service(shop.tenant.id, st.id, shop.cut.id)
    js_dow = (DAY.weekday() + 1) % 7
    await set_working_hours(shop.tenant.id, st.id, days=[js_dow])
    assert (await slots(api, shop, staff=st))["closed_reason"] is None
    assert (await slots(api, shop, staff=st, day=DAY + timedelta(days=1)))["closed_reason"] == "day_off"


async def test_inactive_service_cannot_be_booked(api, shop):
    inactive = await make_service(shop.tenant.id, "Pasif Hizmet", 30, 50, active=False)
    await link_staff_service(shop.tenant.id, shop.staff.id, inactive.id)
    assert (await book(api, shop, "10:00", service=inactive)).status_code == 400
    names = [s["name"] for s in (await api.get("/api/services", slug="alfa")).json()]
    assert "Pasif Hizmet" not in names


async def test_daily_limit_per_customer(api, shop, monkeypatch):
    monkeypatch.setattr(settings, "daily_appointment_limit", 2)
    assert (await book(api, shop, "10:00")).status_code == 200
    assert (await book(api, shop, "11:00")).status_code == 200
    r = await book(api, shop, "12:00")
    assert r.status_code == 400 and "limit" in r.json()["detail"]
    # başka müşteri etkilenmez
    assert (await book(api, shop, "12:00", phone="5550002222")).status_code == 200


async def test_booking_normalizes_customer_name(api, shop):
    r = await book(api, shop, "10:00", name="  ışıl  ", surname="İSMAİL oğlu")
    assert r.status_code == 200
    async with SessionFactory() as db:
        c = (await db.execute(select(Customers).where(Customers.phone == "5550001111"))).scalar_one()
        assert (c.name, c.surname) == ("Işıl", "İsmail Oğlu")


async def test_customer_phone_comes_from_token_not_body(api, shop):
    tok = mint_customer_token(shop.tenant.id, "5550001111")
    b = body(shop, "10:00")
    b["phone"] = "5559999999"  # gövdedeki telefon yok sayılmalı
    r = await api.post("/api/appointments", slug="alfa", token=tok, json=b)
    assert r.status_code == 200
    async with SessionFactory() as db:
        phones = (await db.execute(select(Customers.phone))).scalars().all()
        assert phones == ["5550001111"]


async def test_cancel_rules(api, shop):
    c = await make_customer(shop.tenant.id, "5550001111")
    soon_t = (__import__("datetime").datetime.now() + timedelta(minutes=30))
    # 2 saatten az kala iptal edilemez (yarın değil bugün + 30 dk sonrası; gün sınırında olabilir)
    appt = await make_appointment(shop.tenant.id, c.id, shop.staff.id, shop.cut.id,
                                  soon_t.date(), soon_t.time().replace(second=0, microsecond=0))
    tok = mint_customer_token(shop.tenant.id, "5550001111")
    r = await api.post(f"/api/customer/appointments/{appt.id}/cancel", slug="alfa", token=tok)
    assert r.status_code == 400 and "iptal edilemez" in r.json()["detail"]
    # tamamlanmış randevu iptal edilemez
    done = await make_appointment(shop.tenant.id, c.id, shop.staff.id, shop.cut.id, DAY, time(10, 0),
                                  AppointmentStatus.COMPLETED)
    r = await api.post(f"/api/customer/appointments/{done.id}/cancel", slug="alfa", token=tok)
    assert r.status_code == 400


async def test_admin_created_appointment_respects_grid_and_conflicts(api, shop):
    def ab(at, staff=None, service=None, phone="5550005555"):
        return {"phone": phone, "name": "mehmet", "surname": "ali", "staff_id": (staff or shop.staff).id,
                "service_id": (service or shop.cut).id, "appointment_date": DAY.isoformat(), "appointment_time": at}
    t = shop.owner_token
    r = await api.post("/api/admin/appointments", slug="alfa", token=t, json=ab("10:00"))
    assert r.status_code == 201 and r.json()["customer"]["name"] == "Mehmet"
    assert (await api.post("/api/admin/appointments", slug="alfa", token=t, json=ab("10:00", phone="5550006666"))).status_code == 409
    assert (await api.post("/api/admin/appointments", slug="alfa", token=t, json=ab("10:15", phone="5550006666"))).status_code == 409
    # personel kendi adına alabilir
    r = await api.post("/api/admin/appointments", slug="alfa", token=shop.staff_token, json=ab("12:00", phone="5550007777"))
    assert r.status_code == 201
    # iptal edilince tekrar alınabilir
    aid = (await api.post("/api/admin/appointments", slug="alfa", token=t, json=ab("13:00", phone="5550008888"))).json()["id"]
    assert (await api.patch(f"/api/admin/appointments/{aid}", slug="alfa", token=t, json={"status": "cancelled"})).status_code == 200
    assert (await api.post("/api/admin/appointments", slug="alfa", token=t, json=ab("13:00", phone="5550009999"))).status_code == 201
    # iptali geri açmak, saat başkasına verilmişse 409
    r = await api.patch(f"/api/admin/appointments/{aid}", slug="alfa", token=t, json={"status": "confirmed"})
    assert r.status_code == 409


async def test_customer_me_returns_registered_name_or_null(api, shop):
    tok = mint_customer_token(shop.tenant.id, "5550007777")
    assert (await api.get("/api/customer/me", slug="alfa", token=tok)).json() is None  # henüz kayıt yok
    r = await api.post("/api/appointments", slug="alfa", token=tok, json=body(shop, at="10:00", name="Ayşe", surname="Kaya"))
    assert r.status_code == 200
    assert (await api.get("/api/customer/me", slug="alfa", token=tok)).json() == {"name": "Ayşe", "surname": "Kaya"}
    # başka dükkânda aynı telefon: o dükkânın kaydı yoksa null (izolasyon)
    other = await make_shop("beta", phone_offset=60)
    tok2 = mint_customer_token(other.tenant.id, "5550007777")
    assert (await api.get("/api/customer/me", slug="beta", token=tok2)).json() is None
    assert (await api.get("/api/customer/me", slug="alfa")).status_code == 401
