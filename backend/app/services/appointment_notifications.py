"""Randevu olaylarında WhatsApp bildirimleri (dükkânın KENDİ numarasından, kuyruk üzerinden, aralıklı).

- Randevu alınınca: müşteriye onay + atanan berbere bilgi (berberin kendisi oluşturduysa berbere gitmez).
- İptalde: müşteriye (müşteri iptali / işletme iptali ayrı metin) + atanan berbere bilgi (iptal eden berber değilse).
- Randevuya 1 saat kala: müşteriye hatırlatma (gece 23:00-08:00 arasında gönderilmez; randevusu o saate yakın alınmışsa gerekmez).
Bildirim hataları randevuyu ASLA bozmaz (loglanır). Dükkânın WhatsApp'ı hiç bağlanmadıysa hiçbir şey kuyruğa girmez."""
import logging
from datetime import datetime, time, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.appointment import Appointment, AppointmentStatus
from app.models.customer import Customers
from app.models.outbound_message import OutboundMessage
from app.models.service import Service
from app.models.staff import Staff
from app.models.tenant import Tenant
from app.models.whatsapp_connection import WhatsappConnection
from app.services import whatsapp_queue as queue, whatsapp_texts as texts

logger = logging.getLogger(__name__)

REMINDER_LEAD = timedelta(minutes=60)
REMINDER_MIN_NOTICE = timedelta(minutes=90)  # randevu bundan daha yakın alındıysa onay zaten yeterli, ayrıca hatırlatılmaz
WALKIN_SKIP = timedelta(minutes=60)  # işletmenin elle girdiği ve hemen başlayan randevuya onay gitmez (müşteri zaten orada)
QUIET_START, QUIET_END = time(23, 0), time(8, 0)


def in_quiet_hours(now: datetime) -> bool:
    return now.time() >= QUIET_START or now.time() < QUIET_END


async def _connected(db: AsyncSession, tenant_id: int) -> bool:
    row = (await db.execute(select(WhatsappConnection.tenant_id).where(WhatsappConnection.tenant_id == tenant_id))).first()
    return row is not None  # hiç bağlanmamış dükkânda kuyruk biriktirmeyiz


async def _load(db: AsyncSession, appt: Appointment):
    customer = (await db.execute(select(Customers).where(Customers.id == appt.customer_id))).scalar_one()
    staff = (await db.execute(select(Staff).where(Staff.id == appt.staff_id))).scalar_one()
    service = (await db.execute(select(Service).where(Service.id == appt.service_id))).scalar_one()
    return customer, staff, service


def _common(tenant: Tenant, appt: Appointment, customer: Customers, staff: Staff, service: Service) -> dict[str, str]:
    return dict(
        shop=tenant.name, day=texts.fmt_day(appt.appointment_date), date=texts.fmt_date(appt.appointment_date),
        time=texts.fmt_time(appt.appointment_time), staff=staff.name, service=service.name, first=customer.name,
        customer=f"{customer.name} {customer.surname}".strip(), link=texts.site_url(tenant.slug),
    )


def _start(appt: Appointment) -> datetime:
    return datetime.combine(appt.appointment_date, appt.appointment_time)


async def on_created(db: AsyncSession, tenant: Tenant, appt: Appointment, actor: Staff | None = None) -> None:
    """Müşteriye onay + berbere bilgi. actor: randevuyu panelden oluşturan personel (müşteri kendisi aldıysa None)."""
    try:
        if appt.status != AppointmentStatus.CONFIRMED or _start(appt) <= datetime.now() or not await _connected(db, tenant.id):
            return
        customer, staff, service = await _load(db, appt)
        v = _common(tenant, appt, customer, staff, service)
        walk_in = actor is not None and _start(appt) - datetime.now() < WALKIN_SKIP
        if not walk_in:
            kind = "confirm" if actor is None else "confirm_manual"  # panelden girilen randevu ayrı metinle bildirilir
            await queue.enqueue(db, tenant.id, kind, customer.phone, texts.render(kind, tenant.id, **v), appointment_id=appt.id)
        if staff.is_active and (actor is None or actor.id != staff.id):
            await queue.enqueue(db, tenant.id, "staff_new", staff.phone, texts.render("staff_new", tenant.id, **v), appointment_id=appt.id)
        await db.commit()
    except Exception:
        logger.exception("Randevu onay bildirimi kuyruğa alınamadı (randevu etkilenmedi)")
        await db.rollback()


async def on_cancelled(db: AsyncSession, tenant: Tenant, appt: Appointment, by: str, actor: Staff | None = None) -> None:
    """by: 'customer' (müşteri kendisi iptal etti) | 'shop' (işletme/personel iptal etti)."""
    try:
        if _start(appt) <= datetime.now() or not await _connected(db, tenant.id):
            return
        customer, staff, service = await _load(db, appt)
        v = _common(tenant, appt, customer, staff, service)
        kind = "cancel_customer" if by == "customer" else "cancel_shop"
        await queue.enqueue(db, tenant.id, kind, customer.phone, texts.render(kind, tenant.id, **v))
        if staff.is_active and (actor is None or actor.id != staff.id):
            await queue.enqueue(db, tenant.id, "staff_cancel", staff.phone, texts.render("staff_cancel", tenant.id, **v))
        await db.commit()
    except Exception:
        logger.exception("Randevu iptal bildirimi kuyruğa alınamadı (iptal etkilenmedi)")
        await db.rollback()


async def on_rescheduled(db: AsyncSession, tenant: Tenant, appt: Appointment, old_date, old_time, actor: Staff | None = None) -> None:
    """Randevu başka saate alındı. Henüz gitmemiş eski onay/hatırlatma/berber mesajları iptal edilir (eski saati yazmasınlar);
    müşteriye ve atanan berbere yeni bilgi gider."""
    try:
        await db.execute(
            update(OutboundMessage)
            .where(OutboundMessage.appointment_id == appt.id, OutboundMessage.status == "pending",
                   OutboundMessage.kind.in_(("confirm", "confirm_manual", "reminder", "staff_new", "reschedule_customer", "staff_reschedule")))
            .values(status="cancelled", error="rescheduled", to_phone=None, body=None)
        )
        if appt.status == AppointmentStatus.CONFIRMED and _start(appt) > datetime.now() and await _connected(db, tenant.id):
            customer, staff, service = await _load(db, appt)
            v = _common(tenant, appt, customer, staff, service)
            v.update(old_day=texts.fmt_day(old_date), old_date=texts.fmt_date(old_date), old_time=texts.fmt_time(old_time))
            await queue.enqueue(db, tenant.id, "reschedule_customer", customer.phone,
                                texts.render("reschedule_customer", tenant.id, **v), appointment_id=appt.id)
            if staff.is_active and (actor is None or actor.id != staff.id):
                await queue.enqueue(db, tenant.id, "staff_reschedule", staff.phone,
                                    texts.render("staff_reschedule", tenant.id, **v), appointment_id=appt.id)
        await db.commit()
    except Exception:
        logger.exception("Randevu değişikliği bildirimi kuyruğa alınamadı (değişiklik etkilenmedi)")
        await db.rollback()


async def enqueue_due_reminders(db: AsyncSession, now: datetime | None = None) -> int:
    """Başlamasına 1 saat ya da daha az kalan, onaylı, henüz hatırlatılmamış randevular için hatırlatma kuyruğa alır.
    Gece (23:00-08:00) gönderilmez; son dakika alınan randevuya gerek yok. Her randevu için en fazla bir kez. Kuyruğa alınan sayıyı döner."""
    now = now or datetime.now()
    rows = (await db.execute(
        select(Appointment, Tenant)
        .join(Tenant, Tenant.id == Appointment.tenant_id)
        .where(
            Appointment.status == AppointmentStatus.CONFIRMED, Appointment.reminder_sent == False,  # noqa: E712
            Appointment.appointment_date >= now.date(), Appointment.appointment_date <= (now + REMINDER_LEAD).date(),
        )
    )).all()
    sent = 0
    for appt, tenant in rows:
        start = _start(appt)
        if start <= now or start - now > REMINDER_LEAD:
            continue
        appt.reminder_sent = True  # tekrar taranmasın (gönderilse de, atlansa da)
        created = appt.created_at or (start - timedelta(days=1))
        if in_quiet_hours(now) or start - created < REMINDER_MIN_NOTICE or not await _connected(db, tenant.id):
            continue
        try:
            customer, staff, service = await _load(db, appt)
            body = texts.render("reminder", tenant.id, **_common(tenant, appt, customer, staff, service))
            await queue.enqueue(db, tenant.id, "reminder", customer.phone, body, appointment_id=appt.id)
            sent += 1
        except Exception:
            logger.exception("Hatırlatma kuyruğa alınamadı (randevu %s)", appt.id)
    await db.commit()
    return sent
