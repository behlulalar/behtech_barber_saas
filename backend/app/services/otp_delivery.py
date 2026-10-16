"""Doğrulama kodunu kullanıcıya iletir. Mesaj DÜKKÂNIN KENDİ WhatsApp'ından gider; platform ortak hat sağlamaz.
Kodlar kuyruğa girmez (kullanıcı bekliyor), ama ban/kötüye kullanım korumasından geçer (bkz. whatsapp_guard):
IP sınırı, dükkân tavanı, doğrulanmayan kod alarmı, WhatsApp'ı olmayan numaraya gönderim yok, kısa "yazıyor" beklemesi,
arka arkaya hatada otomatik durdurma. Her deneme `message_logs`'a yazılır (içerik/telefon yok)."""
import logging

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.message_log import MessageLog
from app.services import whatsapp_connection_services, whatsapp_guard as guard, whatsapp_services
from app.services.whatsapp_services import to_whatsapp_number  # noqa: F401  (diğer modüller buradan da alır)

logger = logging.getLogger(__name__)

DELIVERY_FAILED = "Doğrulama kodu şu an gönderilemiyor, lütfen tekrar deneyin"
NOT_CONNECTED = "Bu işletmenin WhatsApp bağlantısı kurulu değil, doğrulama kodu gönderilemiyor. Lütfen işletmeyi arayın"
TENANT_LIMITED = guard.TENANT_LIMITED


async def _send(db: AsyncSession, tenant_id: int | None, phone: str, text_: str) -> None:
    """Geliştirmede dükkân bağlı değilse gönderilmez (kod yanıtla döner); bağlıysa gerçekten gönderilir (uçtan uca deneme için)."""
    row = await whatsapp_connection_services.get_row(db, tenant_id) if tenant_id is not None else None
    if row is None or row.state != "open":
        if settings.environment == "development":
            return
        raise HTTPException(status_code=503, detail=NOT_CONNECTED)
    guard.ensure_usable(row)
    number = to_whatsapp_number(phone)

    exists = guard.cached_has_whatsapp(number)
    if exists is None:
        try:
            exists = await whatsapp_services.has_whatsapp(row.instance_name, number)
        except whatsapp_services.EvolutionError:
            exists = None  # bilinmiyor: meşru müşteriyi engellememek için göndermeyi dene
        if exists is not None:
            guard.remember_has_whatsapp(number, exists)
    if exists is False:
        raise HTTPException(status_code=400, detail=guard.NO_WHATSAPP)

    try:
        await whatsapp_services.send_text(row.instance_name, number, text_, delay_ms=guard.otp_delay_ms())
    except whatsapp_services.EvolutionError as exc:
        # Mesajı (kod içerir) ve telefonu loglama; yalnızca hata türü.
        logger.error("OTP WhatsApp ile gönderilemedi (tenant %s): %s", tenant_id, exc)
        await guard.record_result(db, row, ok=False)
        await db.commit()
        raise HTTPException(status_code=503, detail=DELIVERY_FAILED)
    await guard.record_result(db, row, ok=True)


async def deliver_code(
    db: AsyncSession, tenant_id: int, kind: str, phone: str, text_: str, ip: str | None = None
) -> None:
    """kind: 'otp' | 'password_reset'. Koruma sınırları aşılmışsa 429; başarısızlık da kaydedilir."""
    if tenant_id is not None:
        await guard.check_otp_allowed(db, tenant_id, ip)
    try:
        await _send(db, tenant_id, phone, text_)
    except HTTPException as exc:
        if exc.status_code == 503:  # gerçek gönderim hatası; 400 (WhatsApp yok) sayılmaz ama IP kaydı tutulur
            db.add(MessageLog(tenant_id=tenant_id, kind=kind, ok=False, ip=ip))
        else:
            db.add(MessageLog(tenant_id=tenant_id, kind="rejected", ok=False, ip=ip))
        await db.commit()
        raise
    db.add(MessageLog(tenant_id=tenant_id, kind=kind, ok=True, ip=ip))
    await db.commit()
