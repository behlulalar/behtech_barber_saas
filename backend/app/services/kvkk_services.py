"""KVKK araçları (platform): işletme verisini dışa aktarma (ZIP/CSV) ve silme (anonimleştirme).

Silme ilkesi: kişisel veri (müşteri, personel, randevu, görsel, bildirim, WhatsApp hattı...) KALICI silinir; yasal saklama gereken
muhasebe kaydı (abonelik dönemleri + ödemeler), denetim kaydı ve işletmenin sözleşme onayı korunur. İşletme kaydı anonimleştirilir
(ad/adres alt alanı değişir, giriş kapanır). Geri alınamaz; bu yüzden işletme önce pasife alınmış ve alt alan adı yazılarak onaylanmış olmalı."""
import csv
import io
import logging
import zipfile
from datetime import datetime

from fastapi import HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import media
from app.models.announcement import AnnouncementTarget
from app.models.appointment import Appointment
from app.models.consent_record import ConsentRecord
from app.models.customer import Customers
from app.models.login_attempt import LoginAttempt
from app.models.notification import AnnouncementRead, Notification
from app.models.outbound_message import OutboundMessage
from app.models.payment import Payment
from app.models.payment_method import PaymentMethod
from app.models.platform_admin import PlatformAdmin
from app.models.service import Service
from app.models.staff import Staff
from app.models.subscription import Subscription
from app.models.support_ticket import SupportTicket
from app.models.tenant import Tenant, new_login_token
from app.models.tenant_settings import TenantSettings
from app.models.verification_code import VerificationCode
from app.models.webhook_cooldown import WebhookCooldown
from app.models.welcome_contact import WelcomeContact
from app.models.whatsapp_connection import WhatsappConnection
from app.services import whatsapp_services as evo
from app.services.audit_services import audit

logger = logging.getLogger(__name__)


def _cell(value) -> str:
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text  # Excel formül enjeksiyonuna karşı


def _csv(header: list[str], rows: list[list]) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";", lineterminator="\r\n")
    w.writerow(header)
    for r in rows:
        w.writerow([_cell(c) for c in r])
    return ("\ufeff" + buf.getvalue()).encode("utf-8")


async def _tenant(db: AsyncSession, tenant_id: int) -> Tenant:
    t = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if t is None:
        raise HTTPException(status_code=404, detail="İşletme bulunamadı")
    return t


async def export_zip(db: AsyncSession, tenant_id: int, actor, request: Request) -> tuple[bytes, str]:
    t = await _tenant(db, tenant_id)
    s = (await db.execute(select(TenantSettings).where(TenantSettings.tenant_id == tenant_id))).scalar_one_or_none()
    staff = (await db.execute(select(Staff).where(Staff.tenant_id == tenant_id).order_by(Staff.id))).scalars().all()
    services = (await db.execute(select(Service).where(Service.tenant_id == tenant_id).order_by(Service.id))).scalars().all()
    customers = (await db.execute(select(Customers).where(Customers.tenant_id == tenant_id).order_by(Customers.id))).scalars().all()
    appts = (await db.execute(select(Appointment).where(Appointment.tenant_id == tenant_id)
                              .order_by(Appointment.appointment_date, Appointment.appointment_time))).scalars().all()
    consents = (await db.execute(select(ConsentRecord).where(ConsentRecord.tenant_id == tenant_id).order_by(ConsentRecord.id))).scalars().all()
    subs = (await db.execute(select(Subscription).where(Subscription.tenant_id == tenant_id).order_by(Subscription.start_date))).scalars().all()
    pays = (await db.execute(select(Payment).where(Payment.tenant_id == tenant_id).order_by(Payment.paid_on))).scalars().all()
    cname = {c.id: f"{c.name} {c.surname}" for c in customers}
    cphone = {c.id: c.phone for c in customers}
    sname = {m.id: f"{m.name} {m.surname}" for m in staff}
    vname = {v.id: v.name for v in services}

    files = {
        "isletme.csv": _csv(["Ad", "Alt alan adı", "Adres", "İletişim telefonu", "WhatsApp telefonu", "Instagram", "Oluşturulma", "Durum"],
                            [[t.name, t.slug, getattr(s, "business_adress", "") if s else "", s.contact_phone if s else "",
                              s.whatsapp_phone if s else "", s.instagram if s else "", t.created_at, "Aktif" if t.is_active else "Pasif"]]),
        "personel.csv": _csv(["Ad", "Soyad", "Telefon", "Rol", "Aktif", "Oluşturulma"],
                             [[m.name, m.surname, m.phone, getattr(m.role, "value", m.role), "Evet" if m.is_active else "Hayır", m.created_at] for m in staff]),
        "hizmetler.csv": _csv(["Hizmet", "Fiyat (₺)", "Süre (dk)", "Aktif"], [[v.name, v.price, v.duration_min, "Evet" if v.is_active else "Hayır"] for v in services]),
        "musteriler.csv": _csv(["Ad", "Soyad", "Telefon", "Kayıt tarihi"], [[c.name, c.surname, c.phone, c.created_at] for c in customers]),
        "randevular.csv": _csv(["Tarih", "Saat", "Müşteri", "Telefon", "Hizmet", "Personel", "Durum", "Ücret (₺)", "Ödeme yöntemi", "Oluşturulma"],
                               [[a.appointment_date, a.appointment_time.strftime("%H:%M"), cname.get(a.customer_id, ""), cphone.get(a.customer_id, ""),
                                 vname.get(a.service_id, ""), sname.get(a.staff_id, ""), getattr(a.status, "value", a.status), a.price,
                                 a.payment_method, a.created_at] for a in appts]),
        "aydinlatma-onaylari.csv": _csv(["Tür", "Sürüm", "Telefon", "IP", "Tarih"], [[c.kind, c.version, c.phone, c.ip, c.created_at] for c in consents]),
        "abonelikler.csv": _csv(["Dönem başlangıcı", "Bitiş", "Paket", "Fiyat (₺)", "Deneme"],
                                [[x.start_date, x.end_date, x.plan_name, x.price, "Evet" if x.is_trial else "Hayır"] for x in subs]),
        "odemeler.csv": _csv(["Ödeme tarihi", "Tutar (₺)", "Yöntem", "Not"], [[p.paid_on, p.amount, p.method, p.note] for p in pays]),
        "OKUBENI.txt": (
            f"{t.name} — veri dışa aktarma ({datetime.now():%d.%m.%Y %H:%M})\r\n\r\n"
            "Bu paket işletmenizin BehTech Randevu'daki verilerini içerir (UTF-8, ';' ayraçlı CSV; Excel'de açılır). "
            "Şifreler ve görseller pakete dahil değildir.\r\n"
        ).encode("utf-8"),
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items():
            z.writestr(name, data)
    await audit(db, actor=actor, request=request, action="tenant.export", entity_type="tenant", entity_id=t.id, tenant_id=t.id,
                summary=f"'{t.name}' işletmesinin verisi dışa aktarıldı",
                details={"customers": len(customers), "appointments": len(appts), "staff": len(staff)})
    await db.commit()
    return buf.getvalue(), f"{t.slug}-veri-{datetime.now():%Y%m%d}.zip"


async def _unreferenced(db: AsyncSession, paths: set[str]) -> list[str]:
    """Hâlâ hiçbir kayıtta kullanılmayan görsel dosya adları (içerik adreslemesi: başka işletme aynı dosyayı kullanıyor olabilir)."""
    from sqlalchemy import or_

    out = []
    for p in paths:
        used = (await db.execute(select(TenantSettings.tenant_id).where(or_(TenantSettings.logo_image == p, TenantSettings.banner_image == p)).limit(1))).first() \
            or (await db.execute(select(Staff.id).where(Staff.photo_image == p).limit(1))).first() \
            or (await db.execute(select(Service.id).where(Service.image == p).limit(1))).first()
        if not used:
            out.append(p.removeprefix(media.PREFIX))
    return out


async def erase(db: AsyncSession, tenant_id: int, confirm_slug: str, actor: PlatformAdmin, request: Request) -> None:
    t = await _tenant(db, tenant_id)
    if t.is_active:
        raise HTTPException(status_code=409, detail="Önce işletmeyi pasife alın, sonra silin")
    if t.slug.startswith("silinmis-"):
        raise HTTPException(status_code=409, detail="Bu işletmenin verisi zaten silinmiş")
    if confirm_slug.strip().lower() != t.slug:
        raise HTTPException(status_code=400, detail="Onay için işletmenin alt alan adını aynen yazın")

    old_name, old_slug = t.name, t.slug
    # Silinecek görsellerin yolları (kayıtlar silinmeden ÖNCE toplanır)
    s = (await db.execute(select(TenantSettings).where(TenantSettings.tenant_id == tenant_id))).scalar_one_or_none()
    paths = {p for p in ([s.logo_image, s.banner_image] if s else []) if media.is_media_path(p)}
    paths |= {p for (p,) in (await db.execute(select(Staff.photo_image).where(Staff.tenant_id == tenant_id))).all() if media.is_media_path(p)}
    paths |= {p for (p,) in (await db.execute(select(Service.image).where(Service.tenant_id == tenant_id))).all() if media.is_media_path(p)}
    conn = (await db.execute(select(WhatsappConnection).where(WhatsappConnection.tenant_id == tenant_id))).scalar_one_or_none()
    instance = conn.instance_name if conn else None

    counts = {}
    for label, model in (("customers", Customers), ("staff", Staff), ("services", Service)):
        counts[label] = len((await db.execute(select(model.id).where(model.tenant_id == tenant_id))).scalars().all())
    # Müşteri silinince randevular da (CASCADE) gider; personel silinince izin/çalışma saati/hizmet eşleşmesi de.
    await db.execute(delete(Appointment).where(Appointment.tenant_id == tenant_id))
    for model in (Customers, Staff, Service, PaymentMethod, TenantSettings, Notification, SupportTicket, OutboundMessage,
                  WelcomeContact, WebhookCooldown, VerificationCode, WhatsappConnection):
        await db.execute(delete(model).where(model.tenant_id == tenant_id))
    await db.execute(delete(LoginAttempt).where(LoginAttempt.scope == "staff", LoginAttempt.key.like(f"%:{tenant_id}")))  # anahtar "<telefon>:<tenant_id>"
    await db.execute(delete(AnnouncementRead).where(AnnouncementRead.tenant_id == tenant_id))
    await db.execute(delete(AnnouncementTarget).where(AnnouncementTarget.tenant_id == tenant_id))
    await db.execute(delete(ConsentRecord).where(ConsentRecord.tenant_id == tenant_id, ConsentRecord.kind == "customer_privacy"))
    # İşletme kaydı anonimleştirilir; abonelik/ödeme (muhasebe) ve işletmenin sözleşme onayı korunur.
    t.name, t.slug, t.note, t.login_token = f"Silinmiş işletme #{t.id}", f"silinmis-{t.id}", None, new_login_token()
    t.is_active = False
    await audit(db, actor=actor, request=request, action="tenant.erase", entity_type="tenant", entity_id=t.id, tenant_id=t.id,
                summary=f"'{old_name}' ({old_slug}) işletmesinin kişisel verisi silindi (muhasebe kaydı korundu)", details=counts)
    await db.commit()

    # Veritabanı işlemi bittikten sonra dosya ve dış sistem temizliği (hata silmeyi geri almaz; loglanır)
    try:
        for name in await _unreferenced(db, paths):
            f = media.file_for(name)
            if f is not None:
                f.unlink(missing_ok=True)
    except Exception:
        logger.exception("Görsel dosyaları temizlenemedi (tenant %s)", tenant_id)
    if instance:
        try:
            await evo.delete_instance(instance)
        except Exception:
            logger.exception("Evolution instance silinemedi: %s", instance)
