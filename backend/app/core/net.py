from fastapi import Request

from app.core.config import settings


def client_ip(request: Request | None) -> str | None:
    """İstemci IP'si. X-Forwarded-For yalnızca güvenilen proxy arkasında (TRUST_PROXY_HEADERS) okunur;
    aksi halde istemci başlığı sahte yazıp IP sınırını atlatabilir."""
    if request is None:
        return None
    if settings.trust_proxy_headers:
        fwd = request.headers.get("x-forwarded-for", "")
        first = fwd.split(",")[0].strip()
        if first:
            return first[:64]
    return request.client.host[:64] if request.client else None
