"""Doğrulama kodunu kullanıcıya iletir. Geliştirmede kod arayüze döndüğü için hiçbir şey göndermez;
üretimde WhatsApp (Evolution API) kullanılır, başarısızlıkta kullanıcıya 503 döner (kod sessizce yutulmaz)."""
import logging

import httpx
from fastapi import HTTPException

from app.core.config import settings
from app.services import whatsapp_services

logger = logging.getLogger(__name__)

DELIVERY_FAILED = "Doğrulama kodu şu an gönderilemiyor, lütfen tekrar deneyin"


def to_whatsapp_number(phone: str) -> str:
    """5XXXXXXXXX -> 905XXXXXXXXX (uluslararası biçim, '+' olmadan)."""
    digits = "".join(ch for ch in phone if ch.isdigit())
    if len(digits) == 10 and digits.startswith("5"):
        return "90" + digits
    if len(digits) == 11 and digits.startswith("05"):
        return "9" + digits
    return digits


async def deliver_code(phone: str, text: str) -> None:
    if settings.environment == "development":
        return  # geliştirme: kod yanıtla (dev_code) arayüze döner, mesaj gönderilmez
    if not (settings.evolution_api_base_url and settings.evolution_api_key and settings.evolution_instance_name):
        logger.error("OTP gönderilemedi: Evolution ayarları eksik")
        raise HTTPException(status_code=503, detail=DELIVERY_FAILED)
    try:
        await whatsapp_services.send_whatsapp_message(to_whatsapp_number(phone), text)
    except (httpx.HTTPError, OSError) as exc:  # HTTPStatusError, bağlantı/zaman aşımı hataları
        # Mesajı (kod içerir) ve telefonu loglama; yalnızca hata türü.
        logger.error("OTP WhatsApp ile gönderilemedi: %s", type(exc).__name__)
        raise HTTPException(status_code=503, detail=DELIVERY_FAILED)
