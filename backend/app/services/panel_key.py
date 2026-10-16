"""Personel paneli giriş adresinin gizli parçası (tenants.login_token).

Gizlilik tek başına güvenlik değildir; bu yüzden anahtar YALNIZCA arayüzde değil, giriş uçlarında da zorunludur
(/auth/login, /auth/forgot/*): adresi bilmeyen biri API'ye doğrudan istek atsa da giriş deneyemez. Yanlış anahtar,
var olmayan sayfa gibi 404 döner ve IP başına sayılır (5 hata -> 15 dk kilit): tahmin denemesi yapılamaz."""
import secrets

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.net import client_ip
from app.models.tenant import Tenant
from app.services import login_throttle

SCOPE = "panel_key"
NOT_FOUND = "Sayfa bulunamadı"


def login_path(tenant: Tenant) -> str:
    return f"/panel/g/{tenant.login_token}"


async def require(db: AsyncSession, tenant: Tenant, key: str | None, request: Request) -> None:
    ip = client_ip(request) or "unknown"
    lock_key = login_throttle.make_key(ip)
    await login_throttle.ensure_not_locked(db, SCOPE, lock_key, request)
    if key and secrets.compare_digest(key.encode(), tenant.login_token.encode()):
        return
    await login_throttle.record_failure(db, SCOPE, lock_key, request)
    raise HTTPException(status_code=404, detail=NOT_FOUND)
