"""Evolution API (v2) istemcisi. Evolution sunucusu platformundur; WhatsApp HESAPLARI dükkânlarındır:
her dükkânın ayrı bir instance'ı vardır (whatsapp_connections.instance_name).

UYARI: Yanıt alan adları Evolution v2.1 dokümantasyonuna göre yazıldı ve farklı sürümlere karşı savunmacı okunur;
gerçek bir bağlantıyla doğrulandığında bu not güncellenmeli.
Reference: https://doc.evolution-api.com/v2/api-reference
"""
import httpx

from app.core.config import settings


class EvolutionError(Exception):
    """Evolution'a ulaşılamadı ya da beklenmeyen yanıt verdi."""


def configured() -> bool:
    return bool(settings.evolution_api_base_url and settings.evolution_api_key)


def _client() -> httpx.AsyncClient:
    """Test için tek değiştirme noktası (testlerde MockTransport'lu istemci döner)."""
    return httpx.AsyncClient()


async def _call(method: str, path: str, *, json: dict | None = None, params: dict | None = None,
                ok_statuses: tuple[int, ...] = (), timeout: float = 10.0) -> httpx.Response:
    if not configured():
        raise EvolutionError("Evolution ayarları eksik")
    url = f"{settings.evolution_api_base_url.rstrip('/')}{path}"
    try:
        async with _client() as client:
            r = await client.request(method, url, headers={"apikey": settings.evolution_api_key},
                                     json=json, params=params, timeout=timeout)
    except (httpx.HTTPError, OSError) as exc:
        raise EvolutionError(type(exc).__name__) from exc
    if r.status_code >= 400 and r.status_code not in ok_statuses:
        raise EvolutionError(f"HTTP {r.status_code}")
    return r


def _json(r: httpx.Response) -> dict | list:
    try:
        return r.json()
    except ValueError:
        return {}


def _webhook() -> dict | None:
    if not (settings.evolution_webhook_url and settings.evolution_webhook_secret):
        return None
    sep = "&" if "?" in settings.evolution_webhook_url else "?"
    return {
        "enabled": True,
        "url": f"{settings.evolution_webhook_url}{sep}token={settings.evolution_webhook_secret}",
        "byEvents": False,
        "base64": False,
        "events": ["CONNECTION_UPDATE"],
    }


def _qr_fields(data: dict) -> tuple[str | None, str | None]:
    """(qr_base64 data URL, pairing_code). Yanıt hem kökte hem 'qrcode' altında gelebilir."""
    src = data.get("qrcode") if isinstance(data.get("qrcode"), dict) else data
    qr = src.get("base64") or None
    if qr and not str(qr).startswith("data:"):
        qr = f"data:image/png;base64,{qr}"
    return qr, src.get("pairingCode") or None


async def create_instance(name: str) -> None:
    """Instance yoksa oluşturur; zaten varsa sessizce geçer."""
    body: dict = {"instanceName": name, "integration": "WHATSAPP-BAILEYS", "qrcode": False}
    hook = _webhook()
    if hook:
        body["webhook"] = hook
    r = await _call("POST", "/instance/create", json=body, ok_statuses=(403, 409))
    if r.status_code in (403, 409):  # "This name is already in use" -> var, devam
        if hook:
            await _call("POST", f"/webhook/set/{name}", json={"webhook": hook}, ok_statuses=(400, 404))


async def connect(name: str, number: str | None = None) -> tuple[str | None, str | None]:
    """Bağlantıyı başlatır. number (90...) verilirse eşleştirme kodu da üretilir. (qr_base64, pairing_code) döner."""
    r = await _call("GET", f"/instance/connect/{name}", params={"number": number} if number else None)
    data = _json(r)
    return _qr_fields(data if isinstance(data, dict) else {})


async def connection_state(name: str) -> str:
    r = await _call("GET", f"/instance/connectionState/{name}", ok_statuses=(404,), timeout=4.0)
    if r.status_code == 404:
        return "close"
    data = _json(r)
    if not isinstance(data, dict):
        return "close"
    inner = data.get("instance") if isinstance(data.get("instance"), dict) else data
    return str(inner.get("state") or "close")


async def owner(name: str) -> tuple[str | None, str | None]:
    """Bağlı hesabın (numara, profil adı). Bilinmiyorsa (None, None)."""
    r = await _call("GET", "/instance/fetchInstances", params={"instanceName": name}, ok_statuses=(404,), timeout=4.0)
    data = _json(r)
    items = data if isinstance(data, list) else [data]
    for it in items:
        if not isinstance(it, dict):
            continue
        it = it.get("instance") if isinstance(it.get("instance"), dict) else it
        jid = it.get("ownerJid") or it.get("owner") or ""
        phone = "".join(ch for ch in str(jid).split("@")[0].split(":")[0] if ch.isdigit()) or None
        return phone, it.get("profileName") or None
    return None, None


async def logout(name: str) -> None:
    await _call("DELETE", f"/instance/logout/{name}", ok_statuses=(400, 404))


async def send_text(name: str, number: str, message: str) -> None:
    """Dükkânın kendi instance'ından metin mesajı. v1 (`textMessage.text`) ve v2 (`text`) biçimi birlikte gönderilir."""
    await _call("POST", f"/message/sendText/{name}", json={"number": number, "text": message, "textMessage": {"text": message}})
