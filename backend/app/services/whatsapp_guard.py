"""WhatsApp ban ve kötüye kullanım koruması.

İlke: hacmi değil KÖTÜYE KULLANIMI sınırla. Dışarıdan (müşteri sitesinden) tetiklenebilen doğrulama kodları
IP / dükkân tavanı / "doğrulanmayan kod" alarmıyla korunur. Sistem mesajları (onay, iptal, hatırlatma) sınırlanmaz;
kuyrukta aralıklı gönderilir (bkz. whatsapp_queue). Hat sağlığı: arka arkaya başarısızlıkta otomatik durdurma,
kopma/ban tespitinde dükkân paneli şeridi + platform bildirimi."""
import logging
import random
import time
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.message_log import MessageLog
from app.models.tenant import Tenant
from app.models.verification_code import VerificationCode
from app.models.whatsapp_connection import WhatsappConnection

logger = logging.getLogger(__name__)

OTP_KINDS = ("otp", "password_reset")
AUTO_PAUSE_PREFIX = "Otomatik:"

IP_LIMITED = "Bu bağlantıdan çok fazla doğrulama kodu istendi, lütfen daha sonra tekrar deneyin"
TENANT_LIMITED = "Bu işletme için çok fazla doğrulama kodu istendi, lütfen bir süre sonra tekrar deneyin"
BREAKER_TRIPPED = "Güvenlik nedeniyle doğrulama kodu gönderimi kısa süreliğine durduruldu, lütfen daha sonra tekrar deneyin"
PAUSED = "Bu işletmenin mesaj gönderimi geçici olarak durduruldu, lütfen işletmeyi arayın"
NO_WHATSAPP = "Bu numarada WhatsApp bulunamadı. Lütfen WhatsApp kullandığınız numarayı girin"


async def _count(db: AsyncSession, *conds) -> int:
    return (await db.execute(select(func.count()).select_from(MessageLog).where(*conds))).scalar_one()


def _since(minutes: int):
    return func.now() - text(f"interval '{int(minutes)} minutes'")


async def check_otp_allowed(db: AsyncSession, tenant_id: int, ip: str | None) -> None:
    """Doğrulama kodu göndermeden önce: IP sınırı, dükkân tavanı, doğrulanmayan kod alarmı. Aşılırsa 429."""
    kinds = MessageLog.kind.in_(OTP_KINDS)
    if ip:
        if await _count(db, kinds, MessageLog.ip == ip, MessageLog.created_at > _since(60)) >= settings.otp_ip_hourly_limit:
            raise HTTPException(status_code=429, detail=IP_LIMITED)
        if await _count(db, kinds, MessageLog.ip == ip, MessageLog.created_at > _since(24 * 60)) >= settings.otp_ip_daily_limit:
            raise HTTPException(status_code=429, detail=IP_LIMITED)
    t = MessageLog.tenant_id == tenant_id
    if await _count(db, kinds, t, MessageLog.created_at > _since(60)) >= settings.whatsapp_tenant_hourly_limit:
        raise HTTPException(status_code=429, detail=TENANT_LIMITED)
    if await _count(db, kinds, t, MessageLog.created_at > _since(24 * 60)) >= settings.whatsapp_tenant_daily_limit:
        raise HTTPException(status_code=429, detail=TENANT_LIMITED)
    await _check_breaker(db, tenant_id)


async def _check_breaker(db: AsyncSession, tenant_id: int) -> None:
    """Son 1 saatte gönderilip 3 dk içinde girilmeyen müşteri kodları eşiği aştıysa biri rastgele numaralara kod
    yolluyordur (numaralar 'spam' bildirirse hat banlanır). Gönderim, en eski şüpheli kod 1 saatlik pencereden
    çıkana kadar durur; platform bir kez (saatte en fazla bir) bilgilendirilir."""
    unverified = (await db.execute(
        select(func.count()).select_from(VerificationCode).where(
            VerificationCode.tenant_id == tenant_id,
            VerificationCode.purpose == "login",
            VerificationCode.is_used == False,  # noqa: E712
            VerificationCode.created_at > _since(60),
            VerificationCode.created_at < _since(3),
        )
    )).scalar_one()
    if unverified < settings.otp_unverified_breaker:
        return
    row = (await db.execute(select(WhatsappConnection).where(WhatsappConnection.tenant_id == tenant_id))).scalar_one_or_none()
    now = datetime.now()
    if row is not None and (row.abuse_alerted_at is None or row.abuse_alerted_at < now - timedelta(hours=1)):
        row.abuse_alerted_at = now
        await db.commit()
        name = (await db.execute(select(Tenant.name).where(Tenant.id == tenant_id))).scalar_one_or_none() or str(tenant_id)
        await alert_platform(db, "Şüpheli kod trafiği",
                             f"'{name}' için son 1 saatte {unverified} doğrulama kodu girilmedi. Kod gönderimi geçici olarak durduruldu.")
    raise HTTPException(status_code=429, detail=BREAKER_TRIPPED)


def otp_delay_ms() -> int:
    """Kodlar beklenir: kısa "yazıyor..." süresi."""
    return random.randint(900, 2000)


def queue_delay_ms() -> int:
    return random.randint(1500, 3500)


# Numara başına "WhatsApp var mı" sonucu (süreç içi önbellek; aynı müşteriye tekrar tekrar sormayalım).
_WA_CACHE: dict[str, tuple[bool, float]] = {}
_WA_TTL = 24 * 3600


def cached_has_whatsapp(number: str) -> bool | None:
    hit = _WA_CACHE.get(number)
    if hit and time.monotonic() - hit[1] < _WA_TTL:
        return hit[0]
    return None


def remember_has_whatsapp(number: str, exists: bool) -> None:
    if len(_WA_CACHE) > 50_000:
        _WA_CACHE.clear()
    _WA_CACHE[number] = (exists, time.monotonic())


def ensure_usable(row: WhatsappConnection) -> None:
    if row.paused:
        raise HTTPException(status_code=503, detail=PAUSED)


async def record_result(db: AsyncSession, row: WhatsappConnection, ok: bool) -> None:
    """Gönderim sonucu: başarıda sayaç sıfırlanır; eşik kadar arka arkaya hatada gönderim otomatik durur. Commit ÇAĞIRANDA."""
    if ok:
        row.consecutive_failures = 0
        row.last_sent_at = datetime.now()
        return
    row.consecutive_failures = (row.consecutive_failures or 0) + 1
    if row.consecutive_failures >= settings.whatsapp_failure_pause and not row.paused:
        row.paused = True
        row.paused_at = datetime.now()
        row.paused_reason = f"{AUTO_PAUSE_PREFIX} arka arkaya {row.consecutive_failures} başarısız gönderim"
        name = (await db.execute(select(Tenant.name).where(Tenant.id == row.tenant_id))).scalar_one_or_none() or str(row.tenant_id)
        from app.services import notification_services as notif  # döngüsel içe aktarmayı önler
        await notif.raise_alert(db, row.tenant_id, "wa_paused", "warning", "WhatsApp gönderimi durduruldu",
                                "Art arda mesajlar gönderilemediği için gönderim otomatik durduruldu. Bağlantınızı kontrol edin; sorun sürerse bizimle iletişime geçin.",
                                link="/panel/whatsapp")
        await alert_platform(db, "WhatsApp gönderimi durduruldu",
                             f"'{name}': arka arkaya {row.consecutive_failures} mesaj gönderilemedi, gönderim otomatik durduruldu.")


async def alert_platform(db: AsyncSession, title: str, body: str) -> None:
    """Platform sahibine push + e-posta. Hata fırlatmaz."""
    try:
        from app.services import billing_services, notify_services
        ps = await billing_services.get_settings_row(db)
        await notify_services.send_email(ps.notify_email, f"BehTech: {title}", f"<p>{body}</p>", body)
        await notify_services.send_push_to_all(db, title, body, "/platform/sistem")
    except Exception:
        logger.exception("Platform alert failed")


_BG_ALERTS: set = set()


def alert_platform_background(title: str, body: str) -> None:
    """alert_platform'u ARKA PLANDA (kendi oturumuyla) çalıştırır: yavaş push/e-posta isteği çağıran isteği bekletmesin."""
    import asyncio

    async def run() -> None:
        try:
            from app.core.database import SessionFactory

            async with SessionFactory() as db:
                await alert_platform(db, title, body)
        except Exception:
            logger.exception("Arka plan platform bildirimi başarısız")

    task = asyncio.get_running_loop().create_task(run())
    _BG_ALERTS.add(task)
    task.add_done_callback(_BG_ALERTS.discard)
