import httpx
from app.core.config import settings


async def send_whatsapp_message(phone: str, message: str) -> None:
    """Evolution API üzerinden WhatsApp metin mesajı gönderir.

    Reference: https://docs.evolutionfoundation.com.br/evolution-api/send-text-message.md
    """
    url = f"{settings.evolution_api_base_url}/message/sendText/{settings.evolution_instance_name}"
    headers = {"apikey": settings.evolution_api_key}
    payload = {"number": phone, "textMessage": {"text": message}}

    async with httpx.AsyncClient() as client:
        response = await client.post(url, headers=headers, json=payload, timeout=10.0)
        response.raise_for_status()
