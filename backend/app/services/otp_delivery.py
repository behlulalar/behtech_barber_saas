"""Doğrulama kodunu kullanıcıya iletir. Geliştirmede kod arayüze döndüğü için hiçbir şey göndermez;
üretimde WhatsApp (Evolution API) kullanılır, başarısızlıkta kullanıcıya 503 döner (kod sessizce yutulmaz).
Her deneme `message_logs`'a yazılır (içerik/telefon yok) ve işletme başına saatlik sınır uygulanır."""
import logging

import httpx
from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.message_log import MessageLog
from app.services import whatsapp_services

logger = logging.getLogger(__name__)

DELIVERY_FAILED = "Doğrulama kodu şu an gönderilemiyor, lütfen tekrar deneyin"
TENANT_LIMITED = "Bu işletme için çok fazla doğrulama kodu istendi, lütfen bir süre sonra tekrar deneyin"


def to_whatsapp_number(phone: str) -> str:
    """5XXXXXXXXX -> 905XXXXXXXXX (uluslararası biçim, '+' olmadan)."""
    digits = "".join(ch for ch in phone if ch.isdigit())
    if len(digits) == 10 and digits.startswith("5"):
        return "90" + digits
    if len(digits) == 11 and digits.startswith("05"):
        return "9" + digits
    return digits


async def _check_tenant_limit(db: AsyncSession, tenant_id: int) -> None:
    sent = (await db.execute(
        select(func.count()).select_from(MessageLog).where(
            MessageLog.tenant_id == tenant_id,
            MessageLog.created_at > func.now() - text("interval '1 hour'"),
        )
    )).scalar_one()
    if tenant_id is not None and sent >= settings.whatsapp_tenant_hourly_limit:
        raise HTTPException(status_code=429, detail=TENANT_LIMITED)


async def _send(phone: str, text_: str) -> None:
    if settings.environment == "development":
        return  # geliştirme: kod yanıtla (dev_code) arayüze döner, mesaj gönderilmez
    if not (settings.evolution_api_base_url and settings.evolution_api_key and settings.evolution_instance_name):
        logger.error("OTP gönderilemedi: Evolution ayarları eksik")
        raise HTTPException(status_code=503, detail=DELIVERY_FAILED)
    try:
        await whatsapp_services.send_whatsapp_message(to_whatsapp_number(phone), text_)
    except (httpx.HTTPError, OSError) as exc:  # HTTPStatusError, bağlantı/zaman aşımı hataları
        # Mesajı (kod içerir) ve telefonu loglama; yalnızca hata türü.
        logger.error("OTP WhatsApp ile gönderilemedi: %s", type(exc).__name__)
        raise HTTPException(status_code=503, detail=DELIVERY_FAILED)


async def deliver_code(db: AsyncSession, tenant_id: int, kind: str, phone: str, text_: str) -> None:
    """kind: 'otp' | 'password_reset'. İşletme saatlik sınırı aşmışsa 429; başarısızlık da kaydedilir."""
    await _check_tenant_limit(db, tenant_id)
    try:
        await _send(phone, text_)
    except HTTPException:
        db.add(MessageLog(tenant_id=tenant_id, kind=kind, ok=False))
        await db.commit()
        raise
    db.add(MessageLog(tenant_id=tenant_id, kind=kind, ok=True))
    await db.commit()
