"""Giden mesaj kuyruğu + arka plan işçisi.

Onay / iptal / hatırlatma / personel bildirimi gibi sistem mesajları burada sıraya girer ve HER DÜKKÂNIN KENDİ
numarasından rastgele aralıklarla (WHATSAPP_QUEUE_GAP_MIN..MAX sn) gönderilir. Hacim sınırı yoktur: yoğun saatte
mesaj düşmez, yalnızca birkaç saniye gecikir. Acil olmayan türler (hatırlatma) gece saatlerinde bekletilir.

Birden fazla uvicorn worker'ı güvenle çalışır: mesaj satırı `FOR UPDATE SKIP LOCKED`, dükkân satırı `FOR UPDATE`
ile kilitlenir; aynı numaradan aynı anda iki mesaj çıkmaz."""
import asyncio
import logging
import random
from datetime import datetime, time, timedelta

from sqlalchemy import and_, delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import SessionFactory
from app.models.appointment import Appointment, AppointmentStatus
from app.models.message_log import MessageLog
from app.models.outbound_message import OutboundMessage
from app.models.whatsapp_connection import WhatsappConnection
from app.services import appointment_notifications, whatsapp_connection_services, whatsapp_guard as guard, whatsapp_services
from app.services.whatsapp_services import to_whatsapp_number

logger = logging.getLogger(__name__)

QUIET_KINDS = {"reminder"}  # gece gönderilmez
QUIET_START, QUIET_END = time(23, 0), time(8, 0)
MAX_ATTEMPTS = 3
EXPIRE_AFTER = timedelta(hours=24)  # bağlantı gelmezse bekleyen mesaj iptal
HEALTH_EVERY = timedelta(minutes=5)
LOG_RETENTION_DAYS = 90


def _after_quiet(now: datetime) -> datetime:
    t = now.time()
    if t >= QUIET_START:
        return datetime.combine(now.date() + timedelta(days=1), QUIET_END)
    if t < QUIET_END:
        return datetime.combine(now.date(), QUIET_END)
    return now


# Bayat mesaj gitmesin: hat bir süre kopuk kalıp dönünce eski onay/hatırlatmalar toplu yağmasın.
TTL = {"confirm": timedelta(hours=2), "confirm_manual": timedelta(hours=2), "cancel_customer": timedelta(hours=2), "cancel_shop": timedelta(hours=2),
       "staff_new": timedelta(hours=2), "staff_cancel": timedelta(hours=2),
       "reschedule_customer": timedelta(hours=2), "staff_reschedule": timedelta(hours=2),
       "cancel_none": timedelta(minutes=30), "cancel_late": timedelta(minutes=30), "cancel_link": timedelta(minutes=30), "reminder": timedelta(minutes=30),
       "welcome": timedelta(minutes=10)}
APPOINTMENT_KINDS = {"confirm", "confirm_manual", "reminder", "staff_new", "reschedule_customer", "staff_reschedule"}  # randevu iptal edildiyse gönderilmez


async def enqueue(db: AsyncSession, tenant_id: int, kind: str, phone: str | None, body: str,
                  not_before: datetime | None = None, appointment_id: int | None = None,
                  to_number: str | None = None) -> OutboundMessage:
    """Mesajı sıraya koyar (commit ÇAĞIRANDA). phone: 10 haneli 5XXXXXXXXX; to_number verilirse (ör. @lid kimliği) o kullanılır."""
    now = datetime.now()
    when = not_before or now
    if kind in QUIET_KINDS:
        when = _after_quiet(when)
    ttl = TTL.get(kind)
    msg = OutboundMessage(
        tenant_id=tenant_id, kind=kind, to_phone=to_number or to_whatsapp_number(phone or ""), body=body, not_before=when,
        expires_at=(when + ttl) if ttl else None, appointment_id=appointment_id,
    )
    db.add(msg)
    return msg


async def process_one(db: AsyncSession) -> bool:
    """Gönderilebilir tek bir mesajı işler. İş yaptıysa True."""
    now = datetime.now()
    gap_min = timedelta(seconds=settings.whatsapp_queue_gap_min)
    msg = (await db.execute(
        select(OutboundMessage)
        .join(WhatsappConnection, WhatsappConnection.tenant_id == OutboundMessage.tenant_id)
        .where(
            OutboundMessage.status == "pending",
            OutboundMessage.not_before <= now,
            or_(OutboundMessage.expires_at.is_(None), OutboundMessage.expires_at > now),
            WhatsappConnection.state == "open",
            WhatsappConnection.paused == False,  # noqa: E712
            or_(WhatsappConnection.last_sent_at.is_(None), WhatsappConnection.last_sent_at <= now - gap_min),
        )
        .order_by(OutboundMessage.not_before, OutboundMessage.id)
        .limit(1)
        .with_for_update(of=OutboundMessage, skip_locked=True)
    )).scalar_one_or_none()
    if msg is None:
        return False
    row = (await db.execute(
        select(WhatsappConnection).where(WhatsappConnection.tenant_id == msg.tenant_id).with_for_update(skip_locked=True)
    )).scalar_one_or_none()
    if row is None or (row.last_sent_at and row.last_sent_at > now - gap_min):
        await db.rollback()  # başka worker bu numaradan az önce gönderdi
        return False

    if msg.appointment_id and msg.kind in APPOINTMENT_KINDS:
        status = (await db.execute(select(Appointment.status).where(Appointment.id == msg.appointment_id))).scalar_one_or_none()
        if status != AppointmentStatus.CONFIRMED:  # iptal/silinmiş: eski onay ya da hatırlatma gitmesin
            msg.status, msg.error, msg.to_phone, msg.body = "cancelled", "appointment_not_active", None, None
            await db.commit()
            return True

    ok = True
    try:
        exists = guard.cached_has_whatsapp(msg.to_phone) if "@" not in msg.to_phone else None
        if exists is None and "@" not in msg.to_phone:
            try:
                exists = await whatsapp_services.has_whatsapp(row.instance_name, msg.to_phone)
                if exists is not None:
                    guard.remember_has_whatsapp(msg.to_phone, exists)
            except whatsapp_services.EvolutionError:
                exists = None
        if exists is False:
            msg.status, msg.error = "failed", "no_whatsapp"
        else:
            await whatsapp_services.send_text(row.instance_name, msg.to_phone, msg.body or "", delay_ms=guard.queue_delay_ms())
            msg.status, msg.sent_at = "sent", datetime.now()
    except whatsapp_services.EvolutionError as exc:
        ok = False
        msg.attempts += 1
        msg.error = str(exc)[:120]
        if msg.attempts >= MAX_ATTEMPTS:
            msg.status = "failed"
        else:
            msg.not_before = datetime.now() + timedelta(minutes=2 ** msg.attempts)
    if msg.status in ("sent", "failed"):
        msg.to_phone = msg.body = None  # veri azaltma: gönderilen/başarısız mesajın içeriği tutulmaz
    if msg.error != "no_whatsapp":
        await guard.record_result(db, row, ok=ok)
        if ok:
            # Rastgele boşluk: bir sonraki mesaj en erken last_sent_at + gap_min'de; last_sent_at ileri kaydırılarak
            # etkin aralık [gap_min, gap_max] arasında rastgele olur.
            extra = random.uniform(0, max(0.0, settings.whatsapp_queue_gap_max - settings.whatsapp_queue_gap_min))
            row.last_sent_at = datetime.now() + timedelta(seconds=extra)
    db.add(MessageLog(tenant_id=msg.tenant_id, kind=msg.kind, ok=msg.status == "sent"))
    await db.commit()
    return True


async def housekeeping(db: AsyncSession) -> None:
    """Süresi geçen bekleyen mesajları iptal eder, eski mesaj kayıtlarını siler."""
    now = datetime.now()
    await db.execute(
        update(OutboundMessage)
        .where(OutboundMessage.status == "pending", OutboundMessage.expires_at.is_not(None), OutboundMessage.expires_at < now)
        .values(status="cancelled", error="expired", to_phone=None, body=None)
    )
    await db.execute(
        update(OutboundMessage)
        .where(OutboundMessage.status == "pending", OutboundMessage.created_at < now - EXPIRE_AFTER)
        .values(status="cancelled", error="expired", to_phone=None, body=None)
    )
    await db.execute(delete(MessageLog).where(MessageLog.created_at < now - timedelta(days=LOG_RETENTION_DAYS)))
    await db.execute(delete(OutboundMessage).where(
        OutboundMessage.status.in_(("sent", "failed", "cancelled")),
        OutboundMessage.created_at < now - timedelta(days=LOG_RETENTION_DAYS),
    ))
    await db.commit()


async def run_worker(stop: asyncio.Event) -> None:
    """Uygulama ayaktayken çalışır: kuyruğu işler, 5 dk'da bir hat sağlığı ve temizlik."""
    last_health = datetime.min
    last_reminders = datetime.min
    while not stop.is_set():
        try:
            if datetime.now() - last_reminders >= timedelta(seconds=60):
                last_reminders = datetime.now()
                async with SessionFactory() as db:
                    await appointment_notifications.enqueue_due_reminders(db)
            async with SessionFactory() as db:
                worked = await process_one(db)
            if datetime.now() - last_health >= HEALTH_EVERY:
                last_health = datetime.now()
                async with SessionFactory() as db:
                    await whatsapp_connection_services.health_check(db)
                async with SessionFactory() as db:
                    await housekeeping(db)
        except Exception:
            logger.exception("WhatsApp worker tick failed")
            worked = False
        try:
            await asyncio.wait_for(stop.wait(), timeout=0.2 if worked else 2.0)
        except asyncio.TimeoutError:
            pass
