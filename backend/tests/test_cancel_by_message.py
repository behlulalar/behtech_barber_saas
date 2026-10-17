"""WhatsApp'tan "iptal" yazarak randevu iptali."""
import time as _time
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionFactory
from app.models.appointment import Appointment, AppointmentStatus
from app.models.outbound_message import OutboundMessage
from app.services.cancel_by_message import is_cancel_request
from tests.factories import *  # noqa
from tests.helpers import *  # noqa
from tests.test_whatsapp_messages import inbound

JID = "905321112233@s.whatsapp.net"  # müşteri telefonu 5321112233
DAY = tomorrow()


async def say(api, shop, monkeypatch, text="iptal", jid=JID):
    monkeypatch.setattr(settings, "evolution_webhook_secret", "s")
    r = await api.post("/api/webhooks/evolution?token=s", json=inbound(f"bt{shop.tenant.id}-test", jid=jid, text=text))
    assert r.status_code == 200
    async with SessionFactory() as db:
        return (await db.execute(select(OutboundMessage).order_by(OutboundMessage.id))).scalars().all()


async def appt(shop, phone="5321112233", day=DAY, at=time(11, 0)):
    c = await make_customer(shop.tenant.id, phone)
    return await make_appointment(shop.tenant.id, c.id, shop.staff.id, shop.cut.id, day, at)


async def status_of(a):
    async with SessionFactory() as db:
        return (await db.execute(select(Appointment.status).where(Appointment.id == a.id))).scalar_one()


@pytest.mark.parametrize("text,expected", [
    ("iptal", True), ("İPTAL", True), ("Iptal!", True), ("randevumu iptal et", True), ("randevuyu iptal etmek istiyorum", True),
    ("iptal edin lütfen", True), ("iptal etmeyin", False), ("iptal değil", False), ("iptal istemiyorum", False),
    ("merhaba", False), ("", False), (None, False),
    ("arkadaşım bugün gelemeyecek bu yüzden randevuyu iptal etmek zorundayım ne yapmalıyım", False),  # uzun cümle
])
def test_intent_detection(text, expected):
    assert is_cancel_request(text) is expected


async def test_single_upcoming_appointment_is_cancelled_with_notifications(api, shop, monkeypatch):
    await connect_whatsapp(shop.tenant.id)
    a = await appt(shop)
    msgs = await say(api, shop, monkeypatch)
    assert await status_of(a) == AppointmentStatus.CANCELLED
    kinds = [m.kind for m in msgs]
    assert "cancel_customer" in kinds and "staff_cancel" in kinds and "welcome" not in kinds
    cust = next(m for m in msgs if m.kind == "cancel_customer")
    assert cust.to_phone == "905321112233" and "http" in cust.body  # yeniden randevu bağlantısı


async def test_no_appointment_gets_one_info_reply_only(api, shop, monkeypatch):
    await connect_whatsapp(shop.tenant.id)
    msgs = await say(api, shop, monkeypatch)
    assert [m.kind for m in msgs] == ["cancel_none"]
    msgs = await say(api, shop, monkeypatch)  # 10 dk içinde tekrar: yeni cevap yok
    assert [m.kind for m in msgs] == ["cancel_none"]


async def test_multiple_appointments_are_not_cancelled_but_redirected(api, shop, monkeypatch):
    await connect_whatsapp(shop.tenant.id)
    a1, a2 = await appt(shop), None
    c = await make_customer(shop.tenant.id, "5321112234")  # başka numara
    a3 = await make_appointment(shop.tenant.id, c.id, shop.staff.id, shop.cut.id, DAY, time(15, 0))
    a2 = await make_appointment(shop.tenant.id, a1.customer_id, shop.staff.id, shop.cut.id, DAY, time(13, 0))
    msgs = await say(api, shop, monkeypatch)
    assert [m.kind for m in msgs] == ["cancel_link"] and "randevularim" in msgs[0].body
    assert await status_of(a1) == await status_of(a2) == await status_of(a3) == AppointmentStatus.CONFIRMED


async def test_less_than_two_hours_is_not_cancelled(api, shop, monkeypatch):
    await connect_whatsapp(shop.tenant.id)
    soon = datetime.now() + timedelta(minutes=45)
    a = await appt(shop, day=soon.date(), at=soon.time().replace(second=0, microsecond=0))
    msgs = await say(api, shop, monkeypatch)
    assert [m.kind for m in msgs] == ["cancel_late"] and await status_of(a) == AppointmentStatus.CONFIRMED


async def test_unknown_lid_sender_is_redirected_and_other_numbers_untouched(api, shop, monkeypatch):
    await connect_whatsapp(shop.tenant.id)
    a = await appt(shop)
    msgs = await say(api, shop, monkeypatch, jid="123456789012345@lid")
    assert [m.kind for m in msgs] == ["cancel_link"] and await status_of(a) == AppointmentStatus.CONFIRMED
    other = await say(api, shop, monkeypatch, jid="905559998877@s.whatsapp.net")  # başkası "iptal" yazdı
    assert await status_of(a) == AppointmentStatus.CONFIRMED and other[-1].kind == "cancel_none"


async def test_negated_or_ordinary_text_does_not_cancel(api, shop, monkeypatch):
    await connect_whatsapp(shop.tenant.id)
    a = await appt(shop)
    await say(api, shop, monkeypatch, text="iptal etmeyin lütfen")
    assert await status_of(a) == AppointmentStatus.CONFIRMED


async def test_welcome_can_be_turned_off_but_cancel_replies_still_work(api, shop, monkeypatch):
    await connect_whatsapp(shop.tenant.id)
    r = await api.patch("/api/admin/whatsapp/settings", slug=shop.slug, token=shop.owner_token, json={"welcome_enabled": False})
    assert r.status_code == 200 and r.json()["welcome_enabled"] is False
    assert (await api.get("/api/admin/whatsapp", slug=shop.slug, token=shop.owner_token)).json()["welcome_enabled"] is False
    assert await say(api, shop, monkeypatch, text="merhaba") == []  # karşılama gitmez
    a = await appt(shop)
    msgs = await say(api, shop, monkeypatch, text="iptal")  # iptal akışı etkilenmez
    assert await status_of(a) == AppointmentStatus.CANCELLED and "cancel_customer" in [m.kind for m in msgs]
    await api.patch("/api/admin/whatsapp/settings", slug=shop.slug, token=shop.owner_token, json={"welcome_enabled": True})
    assert [m.kind for m in await say(api, shop, monkeypatch, text="merhaba", jid="905559998877@s.whatsapp.net")].count("welcome") == 1


async def test_welcome_setting_needs_connection_and_manager(api, shop):
    assert (await api.patch("/api/admin/whatsapp/settings", slug=shop.slug, token=shop.owner_token, json={"welcome_enabled": False})).status_code == 409
    await connect_whatsapp(shop.tenant.id)
    assert (await api.patch("/api/admin/whatsapp/settings", slug=shop.slug, token=shop.staff_token, json={"welcome_enabled": False})).status_code == 403
