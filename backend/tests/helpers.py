"""İstemci ve token yardımcıları."""
from datetime import date, timedelta

import httpx
from httpx import ASGITransport

from app.core.config import settings
from app.core.security import create_access_token
from app.main import app


def host_for(slug: str) -> str:
    return f"{slug}.{settings.base_domain}"


def mint_staff_token(staff) -> str:
    """Gerçek girişteki token ile aynı claim'ler (token_version varsa o da eklenir)."""
    claims = {"sub": str(staff.id), "tenant_id": staff.tenant_id, "type": "staff"}
    tv = getattr(staff, "token_version", None)
    if tv is not None:
        claims["tv"] = tv
    return create_access_token(claims)


def mint_platform_token(admin) -> str:
    claims = {"sub": str(admin.id), "type": "platform_admin"}
    tv = getattr(admin, "token_version", None)
    if tv is not None:
        claims["tv"] = tv
    return create_access_token(claims)


def mint_customer_token(tenant_id: int, phone: str, minutes: int = 30) -> str:
    return create_access_token({"type": "customer", "phone": phone, "tenant_id": tenant_id}, expires_minutes=minutes)


def auth(token: str | None) -> dict:
    return {"Authorization": f"Bearer {token}"} if token else {}


class ApiClient:
    """api.get('/api/...', slug='alfa', token=...) -> httpx.Response. slug=None => tenant'sız (platform)."""

    def __init__(self):
        self._c = httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test")

    # Giriş uçları gizli panel anahtarını ister (tenants.login_token). Testlerde otomatik eklenir; bir testin
    # anahtarsız/yanlış anahtarla denemesi için json'a "panel_key" (None dahil) açıkça yazılır.
    _KEYED = ("/api/auth/login", "/api/auth/forgot/send-code", "/api/auth/forgot/reset", "/api/auth/panel-key/verify")

    async def _inject_panel_key(self, path, slug, kw):
        body = kw.get("json")
        if path in self._KEYED and slug and isinstance(body, dict) and "panel_key" not in body:
            from sqlalchemy import select
            from app.core.database import SessionFactory
            from app.models.tenant import Tenant
            async with SessionFactory() as db:
                key = (await db.execute(select(Tenant.login_token).where(Tenant.slug == slug))).scalar_one_or_none()
            if key:
                kw["json"] = {**body, "panel_key": key}

    async def request(self, method, path, *, slug=None, token=None, headers=None, **kw):
        await self._inject_panel_key(path, slug, kw)
        h = dict(auth(token))
        if slug:
            h["Host"] = host_for(slug)
        h.update(headers or {})
        return await self._c.request(method, path, headers=h, **kw)

    async def get(self, path, **kw):
        return await self.request("GET", path, **kw)

    async def post(self, path, **kw):
        return await self.request("POST", path, **kw)

    async def put(self, path, **kw):
        return await self.request("PUT", path, **kw)

    async def patch(self, path, **kw):
        return await self.request("PATCH", path, **kw)

    async def delete(self, path, **kw):
        return await self.request("DELETE", path, **kw)

    async def aclose(self):
        await self._c.aclose()


def tomorrow() -> date:
    return date.today() + timedelta(days=1)
