"""'Fark etmez': birleşik slot gridi ve otomatik berber seçimi."""
import asyncio

from app.models.appointment import AppointmentStatus
from tests.factories import *  # noqa
from tests.helpers import *  # noqa

DAY = tomorrow()


def any_body(shop, at, service=None, name="ali", surname="veli"):
    return {"name": name, "surname": surname, "service_id": (service or shop.cut).id,
            "appointment_date": DAY.isoformat(), "appointment_time": at}  # staff_id YOK


async def book_any(api, shop, at, phone="5550001111", **kw):
    tok = mint_customer_token(shop.tenant.id, phone)
    return await api.post("/api/appointments", slug=shop.slug, token=tok, json=any_body(shop, at, **kw))


async def merged(api, shop, service=None):
    r = await api.get(f"/api/availability/slots?service_id={(service or shop.cut).id}&date={DAY}", slug=shop.slug)
    assert r.status_code == 200, r.text
    return {s["start"]: s for s in r.json()["slots"]}, r.json()


async def fill(shop, staff, at):
    c = await make_customer(shop.tenant.id, f"544{staff.id % 1000:03d}{at.hour:02d}{at.minute:02d}", "Dolu", "Kayit")
    await make_appointment(shop.tenant.id, c.id, staff.id, shop.cut.id, DAY, at)


async def test_merged_grid_is_open_while_any_staff_is_free(api, shop):
    await fill(shop, shop.owner, time(10, 0))
    await fill(shop, shop.staff, time(10, 0))
    by, g = await merged(api, shop)
    assert by["10:00"]["bookable"] is True and by["10:00"]["status"] == "free"  # staff2 boş
    await fill(shop, shop.staff2, time(10, 0))
    by, _ = await merged(api, shop)
    assert by["10:00"]["bookable"] is False and by["10:00"]["status"] == "busy"  # hepsi dolu


async def test_any_booking_picks_least_loaded_then_lowest_id(api, shop):
    r = await book_any(api, shop, "09:00")
    assert r.status_code == 200 and r.json()["staff"]["id"] == shop.owner.id  # eşitlik: en küçük id
    await fill(shop, shop.owner, time(9, 30))
    await fill(shop, shop.staff, time(11, 0))
    await fill(shop, shop.staff, time(11, 30))
    r = await book_any(api, shop, "12:00", phone="5550002222")
    assert r.status_code == 200 and r.json()["staff"]["id"] == shop.staff2.id  # o gün en az randevusu olan


async def test_any_booking_skips_busy_staff(api, shop):
    await fill(shop, shop.owner, time(14, 0))
    await fill(shop, shop.staff, time(14, 0))
    r = await book_any(api, shop, "14:00")
    assert r.status_code == 200 and r.json()["staff"]["id"] == shop.staff2.id


async def test_any_booking_when_everyone_busy_is_409(api, shop):
    for m in (shop.owner, shop.staff, shop.staff2):
        await fill(shop, m, time(16, 0))
    r = await book_any(api, shop, "16:00")
    assert r.status_code == 409


async def test_concurrent_any_bookings_get_different_staff(api, shop):
    results = await asyncio.gather(*[book_any(api, shop, "15:00", phone=f"55500033{i:02d}") for i in range(3)])
    assert all(r.status_code == 200 for r in results), [r.text for r in results]
    assert len({r.json()["staff"]["id"] for r in results}) == 3
    assert (await book_any(api, shop, "15:00", phone="5550004444")).status_code == 409  # 4. kişiye yer yok


async def test_explicit_staff_still_works_and_merged_closed_day(api, shop):
    tok = mint_customer_token(shop.tenant.id, "5550005555")
    r = await api.post("/api/appointments", slug=shop.slug, token=tok, json={**any_body(shop, "10:00"), "staff_id": shop.staff2.id})
    assert r.status_code == 200 and r.json()["staff"]["id"] == shop.staff2.id
    # herkes tüm gün izinliyse birleşik grid kapalı
    for m in (shop.owner, shop.staff, shop.staff2):
        r = await api.post("/api/admin/time-off", slug=shop.slug, token=shop.owner_token,
                           json={"staff_id": m.id, "start_date": DAY.isoformat(), "end_date": DAY.isoformat()})
        assert r.status_code in (200, 201), r.text
    _, g = await merged(api, shop)
    assert g["closed_reason"] == "time_off" and g["slots"] == []
