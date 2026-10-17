"""Müşteri onay mesajına "iptal" yazarak yanıt verdiğinde randevusunu iptal eder (dükkânın WhatsApp'ına gelen mesajdan).

Güvenlik/ban korumaları:
- Yalnızca KISA ve açık iptal ifadeleri tanınır ("iptal", "randevumu iptal et"...). "iptal etmeyin", "iptal değil" gibi olumsuzlar ve uzun
  cümleler yok sayılır; başka hiçbir mesaja otomatik cevap verilmez (karşılama kuralları welcome_services'te).
- Gönderen numara WhatsApp tarafından doğrulanmıştır: yalnızca o numaranın kendi randevusu iptal edilir (başka numaranınki asla).
- Birden fazla yaklaşan randevu varsa ya da gönderen @lid (numara bilinmiyor) ise iptal YAPILMAZ, siteye yönlendirilir.
- Randevuya CANCEL_MIN_HOURS'tan az kaldıysa iptal edilmez (siteyle aynı kural).
- Bilgilendirme cevapları (randevu yok / geç kaldı / siteye yönlendirme) aynı kişiye 10 dakikada en fazla bir kez gider."""
import hashlib
import re
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.appointment import Appointment, AppointmentStatus
from app.models.customer import Customers
from app.models.tenant import Tenant
from app.models.welcome_contact import WelcomeContact
from app.services import appointment_notifications, whatsapp_queue as queue, whatsapp_texts as texts
from app.services.appointment_services import CANCEL_MIN_HOURS

REPLY_COOLDOWN = timedelta(minutes=10)
MAX_TOKENS = 6
_FOLD = str.maketrans("ıİğĞşŞöÖüÜçÇ", "iiggssoouucc")
NEGATIONS = {"etmeyin", "etme", "etmeyiniz", "etmiyorum", "istemiyorum", "degil", "olmasin", "sakin", "edilmesin", "etmeyelim", "yok"}


def _fold(s: str) -> str:
    """Küçük harf + Türkçe karakterleri ASCII'ye indirger ("Iptal", "İPTAL", "iptal" hepsi aynı): ASCII klavyeyle yazanlar da tanınır."""
    return s.translate(_FOLD).lower()


def is_cancel_request(text: str | None) -> bool:
    if not text:
        return False
    tokens = re.sub(r"[^\w\s]", " ", _fold(text)).split()
    if not tokens or len(tokens) > MAX_TOKENS:
        return False
    return any(t.startswith("iptal") for t in tokens) and not (NEGATIONS & set(tokens))


def message_text(item: dict) -> str | None:
    msg = item.get("message")
    if not isinstance(msg, dict):
        return None
    if isinstance(msg.get("conversation"), str):
        return msg["conversation"]
    ext = msg.get("extendedTextMessage")
    return ext.get("text") if isinstance(ext, dict) and isinstance(ext.get("text"), str) else None


async def _reply_allowed(db: AsyncSession, tenant_id: int, who: str, now: datetime) -> bool:
    digest = hashlib.sha256(f"cancel:{tenant_id}:{who}".encode()).hexdigest()
    stmt = (
        insert(WelcomeContact).values(tenant_id=tenant_id, contact_hash=digest, last_sent_at=now)
        .on_conflict_do_update(
            index_elements=["tenant_id", "contact_hash"], set_={"last_sent_at": now},
            where=WelcomeContact.last_sent_at < now - REPLY_COOLDOWN,
        ).returning(WelcomeContact.contact_hash)
    )
    return (await db.execute(stmt)).first() is not None


async def _reply(db: AsyncSession, tenant: Tenant, kind: str, who: str, to: str, now: datetime) -> None:
    if not await _reply_allowed(db, tenant.id, who, now):
        return
    link = texts.my_appointments_url(tenant.slug) if kind == "cancel_link" else texts.site_url(tenant.slug)
    await queue.enqueue(db, tenant.id, kind, None, texts.render(kind, tenant.id, shop=tenant.name, link=link), to_number=to)


async def process(db: AsyncSession, tenant: Tenant, who: str, to: str) -> None:
    """who: kişi kimliği (10+ haneli numara ya da @lid), to: yanıt hedefi. Commit çağıranda."""
    now = datetime.now()
    if "@" in who or len(who) < 10:  # numara bilinmiyor: otomatik iptal yok
        await _reply(db, tenant, "cancel_link", who, to, now)
        return
    phone = who[-10:]
    rows = (await db.execute(
        select(Appointment)
        .join(Customers, Appointment.customer_id == Customers.id)
        .where(
            Appointment.tenant_id == tenant.id, Customers.tenant_id == tenant.id, Customers.phone == phone,
            Appointment.status.in_((AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING)),
            Appointment.appointment_date >= now.date(),
        )
        .order_by(Appointment.appointment_date, Appointment.appointment_time)
    )).scalars().all()
    upcoming = [a for a in rows if datetime.combine(a.appointment_date, a.appointment_time) > now]
    if not upcoming:
        await _reply(db, tenant, "cancel_none", who, to, now)
    elif len(upcoming) > 1:
        await _reply(db, tenant, "cancel_link", who, to, now)
    else:
        appt = upcoming[0]
        if datetime.combine(appt.appointment_date, appt.appointment_time) - now < timedelta(hours=CANCEL_MIN_HOURS):
            await _reply(db, tenant, "cancel_late", who, to, now)
        else:
            appt.status = AppointmentStatus.CANCELLED
            await db.commit()
            await db.refresh(appt)
            # İptal onayı (yeniden randevu bağlantısıyla) + berbere bilgi: sitedeki müşteri iptaliyle aynı bildirimler.
            await appointment_notifications.on_cancelled(db, tenant, appt, by="customer")
