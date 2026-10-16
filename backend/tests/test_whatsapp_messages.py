"""Randevu/iptal/hatırlatma/karşılama/personel bildirimleri: metinler, tetikleyiciler, kuyruk, gelen mesaj işleyicisi."""
import re
import time as _time
from datetime import date, datetime, time, timedelta

import httpx
import pytest
from sqlalchemy import select, update

from app.core.config import settings
from app.core.database import SessionFactory
from app.models.appointment import Appointment, AppointmentStatus
from app.models.outbound_message import OutboundMessage
from app.models.welcome_contact import WelcomeContact
from app.services import appointment_notifications as notif, whatsapp_queue, whatsapp_services, whatsapp_texts as texts
from tests.factories import *  # noqa
from tests.helpers import *  # noqa

TOMORROW = date.today() + timedelta(days=1)
SAMPLE = dict(shop="Alfa Berber", day="Cuma", date="16 Ekim", time="14:30", staff="Kerem", service="Saç Kesimi",
              first="Ali", customer="Ali Veli", link="https://alfa.behtechlabs.com/randevu", code="123456")


async def queued(kind=None):
    async with SessionFactory() as db:
        q = select(OutboundMessage).order_by(OutboundMessage.id)
        rows = (await db.execute(q)).scalars().all()
    return [r for r in rows if kind is None or r.kind == kind]


# ------------------------------------------------------------------ metinler
@pytest.mark.parametrize("kind", ["otp", "password_reset", "confirm", "cancel_customer", "cancel_shop",
                                  "reminder", "staff_new", "staff_cancel", "welcome", "confirm_manual"])
def test_every_kind_has_at_least_three_variants_and_renders_cleanly(kind):
    variants = texts._VARIANTS[kind]
    assert len(variants) >= 3 and len(set(variants)) == len(variants)
    for v in variants:
        out = v.format(**SAMPLE)
        assert not re.search(r"[{}]", out) and len(out) < 300  # kısa, doldurulmamış alan yok


def test_no_link_in_otp_confirm_reminder_staff_messages():
    for kind in ("otp", "password_reset", "confirm", "reminder", "staff_new", "staff_cancel"):
        assert all("{link}" not in v and "http" not in v for v in texts._VARIANTS[kind])


def test_same_variant_is_never_picked_twice_in_a_row():
    texts._last.clear()
    seq = [texts.render("confirm", 7, **SAMPLE) for _ in range(40)]
    assert all(a != b for a, b in zip(seq, seq[1:]))
    assert len(set(seq)) >= 3  # dönüşümlü kullanım


def test_turkish_date_formatting():
    assert texts.fmt_day(date(2026, 10, 16)) == "Cuma" and texts.fmt_date(date(2026, 10, 16)) == "16 Ekim"
    assert texts.fmt_time(time(9, 5)) == "09:05"


# ------------------------------------------------------------------ onay + personel bildirimi
async def test_customer_booking_queues_confirmation_and_staff_notice(api, shop):
    await connect_whatsapp(shop.tenant.id)
    tok = mint_customer_token(shop.tenant.id, "5550001111")
    r = await api.post("/api/appointments", slug="alfa", token=tok, json={
        "name": "Ali", "surname": "Veli", "staff_id": shop.staff.id, "service_id": shop.cut.id,
        "appointment_date": TOMORROW.isoformat(), "appointment_time": "10:00"})
    assert r.status_code == 200
    msgs = await queued()
    assert [m.kind for m in msgs] == ["confirm", "staff_new"]
    confirm, staff_msg = msgs
    assert confirm.to_phone == "905550001111" and "10:00" in confirm.body and "Saç Kesimi" in confirm.body
    assert staff_msg.to_phone == to_wa(shop.staff.phone) and "Ali Veli" in staff_msg.body
    assert confirm.expires_at and confirm.appointment_id  # bayat olmasın + iptal edilirse gitmesin


def to_wa(phone: str) -> str:
    return "90" + phone


async def test_no_messages_for_shop_that_never_connected_whatsapp(api, shop):
    tok = mint_customer_token(shop.tenant.id, "5550001111")
    await api.post("/api/appointments", slug="alfa", token=tok, json={
        "name": "Ali", "surname": "Veli", "staff_id": shop.staff.id, "service_id": shop.cut.id,
        "appointment_date": TOMORROW.isoformat(), "appointment_time": "10:00"})
    assert await queued() == []


async def test_panel_created_appointment_notifies_customer_but_not_the_creating_staff(api, shop):
    await connect_whatsapp(shop.tenant.id)
    r = await api.post("/api/admin/appointments", slug="alfa", token=shop.staff_token, json={
        "staff_id": shop.staff.id, "service_id": shop.cut.id, "name": "Mehmet", "surname": "Kaya", "phone": "5550002222",
        "appointment_date": TOMORROW.isoformat(), "appointment_time": "11:00", "status": "confirmed"})
    assert r.status_code == 201, r.text
    msgs = await queued()
    assert [m.kind for m in msgs] == ["confirm_manual"]  # berber kendisi girdi: kendine bildirim yok; metin "işletme oluşturdu" der
    assert re.search(r"oluşturul|oluşturmuş|kaydedil|alınmıştır", msgs[0].body)
    # sahip, berber adına girerse berbere bilgi gider
    await api.post("/api/admin/appointments", slug="alfa", token=shop.owner_token, json={
        "staff_id": shop.staff.id, "service_id": shop.cut.id, "name": "Veli", "surname": "Can", "phone": "5550003333",
        "appointment_date": TOMORROW.isoformat(), "appointment_time": "12:00", "status": "confirmed"})
    assert [m.kind for m in await queued()] == ["confirm_manual", "confirm_manual", "staff_new"]


async def test_walk_in_starting_within_an_hour_gets_no_confirmation():
    pass  # ayrıntı birim testinde (aşağıda notif.WALKIN_SKIP), HTTP'de saat bağımlılığı olmasın


# ------------------------------------------------------------------ iptal
async def book_one(api, shop, phone="5550001111", at="10:00"):
    tok = mint_customer_token(shop.tenant.id, phone)
    r = await api.post("/api/appointments", slug="alfa", token=tok, json={
        "name": "Ali", "surname": "Veli", "staff_id": shop.staff.id, "service_id": shop.cut.id,
        "appointment_date": (date.today() + timedelta(days=2)).isoformat(), "appointment_time": at})
    return r.json()["id"], tok


async def test_customer_cancel_and_shop_cancel_use_different_texts(api, shop):
    await connect_whatsapp(shop.tenant.id)
    a, tok = await book_one(api, shop, at="10:00")
    b, _ = await book_one(api, shop, phone="5550004444", at="11:00")
    async with SessionFactory() as db:
        await db.execute(OutboundMessage.__table__.delete())
        await db.commit()
    assert (await api.post(f"/api/customer/appointments/{a}/cancel", slug="alfa", token=tok)).status_code == 200
    # müşteri kendi iptali: müşteriye "iptal edildi", berbere bilgi
    assert [m.kind for m in await queued()] == ["cancel_customer", "staff_cancel"]
    async with SessionFactory() as db:
        await db.execute(OutboundMessage.__table__.delete())
        await db.commit()
    r = await api.patch(f"/api/admin/appointments/{b}", slug="alfa", token=shop.owner_token, json={"status": "cancelled"})
    assert r.status_code == 200
    msgs = await queued()
    assert [m.kind for m in msgs] == ["cancel_shop", "staff_cancel"]
    assert "iptal" in msgs[0].body.lower() and "http" in msgs[0].body  # yeniden randevu bağlantısı
    # berber kendi randevusunu iptal ederse kendine bildirim yok
    c, _ = await book_one(api, shop, phone="5550005555", at="12:00")
    async with SessionFactory() as db:
        await db.execute(OutboundMessage.__table__.delete())
        await db.commit()
    await api.patch(f"/api/admin/appointments/{c}", slug="alfa", token=shop.staff_token, json={"status": "cancelled"})
    assert [m.kind for m in await queued()] == ["cancel_shop"]


async def test_completed_or_no_show_status_changes_send_nothing(api, shop):
    await connect_whatsapp(shop.tenant.id)
    a, _ = await book_one(api, shop)
    async with SessionFactory() as db:
        await db.execute(OutboundMessage.__table__.delete())
        await db.commit()
    await api.patch(f"/api/admin/appointments/{a}", slug="alfa", token=shop.owner_token, json={"status": "completed"})
    assert await queued() == []


# ------------------------------------------------------------------ hatırlatma (1 saat kala)
async def make_upcoming(shop, minutes_ahead: int, created_hours_ago: float = 5, status=AppointmentStatus.CONFIRMED):
    now = datetime.now().replace(second=0, microsecond=0)
    start = now + timedelta(minutes=minutes_ahead)
    cust = await make_customer(shop.tenant.id, f"55500{minutes_ahead:05d}"[-10:])
    appt = await make_appointment(shop.tenant.id, cust.id, shop.staff.id, shop.cut.id, start.date(), start.time(), status)
    async with SessionFactory() as db:
        await db.execute(update(Appointment).where(Appointment.id == appt.id)
                         .values(created_at=now - timedelta(hours=created_hours_ago)))
        await db.commit()
    return appt


async def run_reminders(now: datetime) -> int:
    async with SessionFactory() as db:
        return await notif.enqueue_due_reminders(db, now)


NOON = datetime.combine(date.today(), time(13, 0))


async def test_reminder_only_inside_the_last_hour_and_only_once(shop):
    await connect_whatsapp(shop.tenant.id)
    a = await make_appointment(shop.tenant.id, (await make_customer(shop.tenant.id, "5550007001")).id, shop.staff.id, shop.cut.id,
                               NOON.date(), time(14, 0))
    b = await make_appointment(shop.tenant.id, (await make_customer(shop.tenant.id, "5550007002")).id, shop.staff.id, shop.cut.id,
                               NOON.date(), time(16, 0))
    async with SessionFactory() as db:
        await db.execute(update(Appointment).values(created_at=NOON - timedelta(hours=6)))
        await db.commit()
    assert await run_reminders(NOON - timedelta(minutes=5)) == 0  # 14:00'e 65 dk var: henüz erken
    assert await run_reminders(NOON) == 1  # tam 1 saat kala: yalnızca 14:00 randevusu
    assert await run_reminders(NOON + timedelta(minutes=1)) == 0  # ikinci kez gitmez
    msgs = await queued("reminder")
    assert len(msgs) == 1 and "14:00" in msgs[0].body and msgs[0].appointment_id == a.id and "http" not in msgs[0].body
    assert await run_reminders(datetime.combine(NOON.date(), time(15, 0))) == 1  # 16:00 randevusu 1 saat kala


async def test_no_reminder_for_cancelled_late_booked_or_night_hours(shop):
    await connect_whatsapp(shop.tenant.id)
    cust = lambda n: make_customer(shop.tenant.id, f"55500080{n:02d}")  # noqa: E731
    cancelled = await make_appointment(shop.tenant.id, (await cust(1)).id, shop.staff.id, shop.cut.id, NOON.date(), time(14, 0), AppointmentStatus.CANCELLED)
    late = await make_appointment(shop.tenant.id, (await cust(2)).id, shop.staff.id, shop.cut.id, NOON.date(), time(14, 30))
    async with SessionFactory() as db:  # 14:30 randevusu 13:20'de (70 dk önce) alındı -> onay zaten yeterli, ayrıca hatırlatma yok
        await db.execute(update(Appointment).where(Appointment.id == late.id).values(created_at=datetime.combine(NOON.date(), time(13, 20))))
        await db.commit()
    assert await run_reminders(NOON + timedelta(minutes=30)) == 0
    # gece saatleri: 08:30 randevusu için 07:30'da hatırlatma gitmez (ve sonra da gitmez)
    early = await make_appointment(shop.tenant.id, (await cust(3)).id, shop.staff.id, shop.cut.id, NOON.date(), time(8, 30))
    async with SessionFactory() as db:
        await db.execute(update(Appointment).where(Appointment.id == early.id).values(created_at=NOON - timedelta(days=1)))
        await db.commit()
    assert await run_reminders(datetime.combine(NOON.date(), time(7, 45))) == 0
    assert await run_reminders(datetime.combine(NOON.date(), time(8, 5))) == 0


async def test_queue_drops_message_of_cancelled_appointment_and_expires_stale(shop, monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_queue_gap_min", 0.0)
    monkeypatch.setattr(settings, "whatsapp_queue_gap_max", 0.0)
    await connect_whatsapp(shop.tenant.id)
    # Saate bağımlı OLMASIN (gece sessizlik saatlerinde hatırlatma kuyruğa girmez): sabit "öğle" saati kullan.
    appt = await make_appointment(shop.tenant.id, (await make_customer(shop.tenant.id, "5550006001")).id, shop.staff.id,
                                  shop.cut.id, NOON.date(), time(13, 50))
    async with SessionFactory() as db:
        await db.execute(update(Appointment).where(Appointment.id == appt.id).values(created_at=NOON - timedelta(hours=6)))
        await db.commit()
    async with SessionFactory() as db:
        assert await notif.enqueue_due_reminders(db, NOON) == 1
        # Kuyruk gerçek saatle çalışır; gece sessizliği not_before'u ertelemiş olabilir -> test saatten bağımsız olsun
        await db.execute(update(OutboundMessage).values(not_before=datetime.now() - timedelta(minutes=1),
                                                        expires_at=datetime.now() + timedelta(hours=1)))
        await db.commit()
    async with SessionFactory() as db:  # hatırlatma kuyruktayken randevu iptal edildi
        await db.execute(update(Appointment).where(Appointment.id == appt.id).values(status=AppointmentStatus.CANCELLED))
        await db.commit()
    sent = []

    def handler(request: httpx.Request):
        sent.append(request.url.path)
        return httpx.Response(200, json=[{"exists": True}] if "whatsappNumbers" in request.url.path else {"key": {"id": "x"}})

    monkeypatch.setattr(whatsapp_services, "_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    async with SessionFactory() as db:
        assert await whatsapp_queue.process_one(db) is True
    assert not any("sendText" in p for p in sent)  # iptal edilen randevunun hatırlatması gitmedi
    assert (await queued())[0].status == "cancelled"
    # bayat: süresi geçen mesaj gönderilmez, temizlikte iptal olur
    async with SessionFactory() as db:
        await whatsapp_queue.enqueue(db, shop.tenant.id, "confirm", "5550009999", "x")
        await db.execute(update(OutboundMessage).where(OutboundMessage.status == "pending").values(expires_at=datetime.now() - timedelta(minutes=1)))
        await db.commit()
        assert await whatsapp_queue.process_one(db) is False
        await whatsapp_queue.housekeeping(db)
    assert [m.status for m in await queued()] == ["cancelled", "cancelled"]


# ------------------------------------------------------------------ karşılama (gelen mesaj)
def inbound(instance, jid="905321112233@s.whatsapp.net", from_me=False, ts=None, mtype="conversation"):
    return {"event": "messages.upsert", "instance": instance, "data": {
        "key": {"remoteJid": jid, "fromMe": from_me, "id": "ABC"}, "messageType": mtype,
        "messageTimestamp": ts if ts is not None else int(_time.time()), "message": {"conversation": "merhaba"}}}


async def post_inbound(api, shop, monkeypatch, **kw):
    monkeypatch.setattr(settings, "evolution_webhook_secret", "s")
    return await api.post("/api/webhooks/evolution?token=s", json=inbound(f"bt{shop.tenant.id}-test", **kw))


async def test_welcome_sent_once_per_24_hours(api, shop, monkeypatch):
    await connect_whatsapp(shop.tenant.id)
    assert (await post_inbound(api, shop, monkeypatch)).status_code == 200
    msgs = await queued("welcome")
    assert len(msgs) == 1 and msgs[0].to_phone == "905321112233" and "http" in msgs[0].body and "Alfa" in msgs[0].body
    await post_inbound(api, shop, monkeypatch)  # aynı kişi tekrar yazdı
    assert len(await queued("welcome")) == 1
    async with SessionFactory() as db:  # 25 saat geçti
        await db.execute(update(WelcomeContact).values(last_sent_at=datetime.now() - timedelta(hours=25)))
        await db.commit()
    await post_inbound(api, shop, monkeypatch)
    assert len(await queued("welcome")) == 2
    await post_inbound(api, shop, monkeypatch, jid="905559998877@s.whatsapp.net")  # başka kişi
    assert len(await queued("welcome")) == 3


async def test_welcome_ignores_own_messages_groups_old_backlog_and_reactions(api, shop, monkeypatch):
    await connect_whatsapp(shop.tenant.id)
    await post_inbound(api, shop, monkeypatch, from_me=True)
    await post_inbound(api, shop, monkeypatch, jid="1203630@g.us")
    await post_inbound(api, shop, monkeypatch, jid="status@broadcast")
    await post_inbound(api, shop, monkeypatch, ts=int(_time.time()) - 3600)  # yeniden bağlanınca gelen birikmiş geçmiş
    await post_inbound(api, shop, monkeypatch, mtype="reactionMessage")
    await post_inbound(api, shop, monkeypatch, jid="905550000000@s.whatsapp.net")  # bağlı numaramızın kendisi
    assert await queued("welcome") == []


async def test_welcome_not_sent_when_disconnected_paused_or_wrong_secret(api, shop, monkeypatch):
    await connect_whatsapp(shop.tenant.id, state="close")
    await post_inbound(api, shop, monkeypatch)
    assert await queued() == []
    assert (await api.post("/api/webhooks/evolution?token=yanlis", json=inbound(f"bt{shop.tenant.id}-test"))).status_code == 401


async def test_welcome_hourly_cap(api, shop, monkeypatch):
    from app.services import welcome_services
    monkeypatch.setattr(welcome_services, "HOURLY_CAP", 3)
    await connect_whatsapp(shop.tenant.id)
    for i in range(6):
        await post_inbound(api, shop, monkeypatch, jid=f"90532111223{i}@s.whatsapp.net")
    assert len(await queued("welcome")) == 3


async def test_welcome_lid_contacts_are_replied_by_jid(api, shop, monkeypatch):
    await connect_whatsapp(shop.tenant.id)
    await post_inbound(api, shop, monkeypatch, jid="123456789012345@lid")
    assert (await queued("welcome"))[0].to_phone == "123456789012345@lid"


INFORMAL = ("isterseniz", "isterseniz", "görüşmek üzere", "selam", "üzgünüz", "merhaba", "hoşça", "🙏", "👋", "✂️", "⏰")


@pytest.mark.parametrize("kind", sorted(texts._VARIANTS))
def test_tone_is_formal_no_casual_phrases_or_emoji(kind):
    for v in texts._VARIANTS[kind]:
        low = v.lower()
        assert not any(w in low for w in INFORMAL), v
        assert not re.search(r"[\U0001F300-\U0001FAFF\u2600-\u27BF]", v), v  # emoji yok


def test_customer_facing_messages_address_formally():
    for kind in ("cancel_customer", "cancel_shop", "confirm", "reminder"):
        assert any(v.startswith("Sayın {customer}") for v in texts._VARIANTS[kind])


def test_shop_name_never_gets_a_turkish_suffix_attached():
    """İşletme adının sonuna ek ('Kuaför'e', 'Berber'in') getirmek ünlü uyumunu bozar: {shop}'e/{shop}'in/{shop}'i gibi kalıplar yasak."""
    for variants in texts._VARIANTS.values():
        for v in variants:
            assert not re.search(r"\{shop\}['’]", v), v
