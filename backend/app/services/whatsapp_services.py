import httpx
from app.core.config import settings


def _client() -> httpx.AsyncClient:
    """Test için tek değiştirme noktası (testlerde MockTransport'lu istemci döner)."""
    return httpx.AsyncClient()


async def send_whatsapp_message(phone: str, message: str) -> None:
    """Evolution API üzerinden WhatsApp metin mesajı gönderir.

    UYARI: Evolution henüz bağlı değil (QR okutulmadı) ve payload biçimi canlı bir örnekle DOĞRULANMADI.
    Evolution v1 `textMessage.text`, v2 ise düz `text` bekler; ikisini birden gönderiyoruz (fazla alanlar yok sayılır).
    Reference: https://docs.evolutionfoundation.com.br/evolution-api/send-text-message.md
    """
    url = f"{settings.evolution_api_base_url.rstrip('/')}/message/sendText/{settings.evolution_instance_name}"
    headers = {"apikey": settings.evolution_api_key}
    payload = {"number": phone, "text": message, "textMessage": {"text": message}}

    async with _client() as client:
        response = await client.post(url, headers=headers, json=payload, timeout=10.0)
        response.raise_for_status()
