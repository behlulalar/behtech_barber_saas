"""Destek girişi ("İşletme olarak gir"): platform yöneticisi için tek kullanımlık kısa ömürlü kod ->
işletme personeli adına 60 dk'lık token. Güvenlik: audit + kısa ömür + (isteğe bağlı) salt görüntüleme.
Düz kod yalnızca bir kez döner; DB'de sha256 özeti saklanır."""
import hashlib
import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException, Request
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.net import client_ip
from app.core.security import create_access_token
from app.models.impersonation_code import ImpersonationCode
from app.models.platform_admin import PlatformAdmin
from app.models.staff import RoleType, Staff
from app.models.tenant import Tenant
from app.schemas.auth import TokenResponse
from app.schemas.platform import ImpersonateIn, ImpersonateOut
from app.services import login_throttle
from app.services.audit_services import audit

CODE_TTL_SECONDS = 60
TOKEN_MINUTES = 60
INVALID_MSG = "Destek bağlantısı geçersiz veya süresi dolmuş"


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


async def start(
    db: AsyncSession, tenant_id: int, data: ImpersonateIn, admin: PlatformAdmin, request: Request
) -> ImpersonateOut:
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status_code=404, detail="İşletme bulunamadı")
    if not tenant.is_active:
        raise HTTPException(status_code=400, detail="İşletme pasif; önce aktifleştirin")
    if data.staff_id is not None:
        staff = (await db.execute(
            select(Staff).where(Staff.id == data.staff_id, Staff.tenant_id == tenant_id)
        )).scalar_one_or_none()
        if staff is None:
            raise HTTPException(status_code=404, detail="Personel bu işletmeye ait değil")
    else:
        staff = (await db.execute(
            select(Staff).where(Staff.tenant_id == tenant_id, Staff.role == RoleType.SUPER_ADMIN)
            .order_by(Staff.id).limit(1)
        )).scalar_one_or_none()
        if staff is None:
            raise HTTPException(status_code=400, detail="İşletmenin yönetici hesabı bulunamadı")
    code = secrets.token_urlsafe(32)
    db.add(ImpersonationCode(
        code_hash=_hash(code), platform_admin_id=admin.id, tenant_id=tenant_id, staff_id=staff.id,
        read_only=data.read_only, expires_at=datetime.now() + timedelta(seconds=CODE_TTL_SECONDS),
    ))
    await audit(db, actor=admin, request=request, action="impersonation.start", entity_type="tenant",
                entity_id=tenant_id, tenant_id=tenant_id,
                summary=f"'{tenant.name}' için destek girişi başlatıldı" + (" (salt görüntüleme)" if data.read_only else ""),
                details={"staff_id": staff.id, "read_only": data.read_only})
    await db.commit()
    return ImpersonateOut(code=code, slug=tenant.slug, expires_in=CODE_TTL_SECONDS)


async def exchange(db: AsyncSession, code: str, tenant: Tenant, request: Request) -> TokenResponse:
    key = client_ip(request) or "unknown"
    await login_throttle.ensure_not_locked(db, "impersonate", key, request)
    now = datetime.now()
    # Tek kullanım atomik: eşzamanlı iki istekten yalnızca biri satırı güncelleyebilir.
    row = (await db.execute(
        update(ImpersonationCode)
        .where(ImpersonationCode.code_hash == _hash(code), ImpersonationCode.used_at.is_(None),
               ImpersonationCode.expires_at > now, ImpersonationCode.tenant_id == tenant.id)
        .values(used_at=now)
        .returning(ImpersonationCode.platform_admin_id, ImpersonationCode.staff_id, ImpersonationCode.read_only)
    )).first()
    admin = staff = None
    if row is not None:
        admin = (await db.execute(select(PlatformAdmin).where(PlatformAdmin.id == row.platform_admin_id))).scalar_one_or_none()
        staff = (await db.execute(
            select(Staff).where(Staff.id == row.staff_id, Staff.tenant_id == tenant.id)
        )).scalar_one_or_none()
    if row is None or admin is None or not admin.is_active or staff is None:
        await db.commit()  # (varsa) used_at işaretini kalıcı yap
        if await login_throttle.record_failure(db, "impersonate", key, request):
            raise login_throttle.locked_now_error()
        raise HTTPException(status_code=400, detail=INVALID_MSG)
    await db.commit()
    token = create_access_token(
        {"sub": str(staff.id), "tenant_id": staff.tenant_id, "type": "staff", "tv": staff.token_version,
         "imp": admin.id, "ro": bool(row.read_only), "iat_imp": int(now.timestamp())},
        expires_minutes=TOKEN_MINUTES,
    )
    return TokenResponse(access_token=token, token_type="bearer")


async def end(db: AsyncSession, admin: PlatformAdmin, staff: Staff, started_at: int | None, request: Request) -> None:
    duration = max(0, int(datetime.now().timestamp()) - started_at) if started_at else None
    await audit(db, actor=admin, request=request, action="impersonation.end", entity_type="tenant",
                entity_id=staff.tenant_id, tenant_id=staff.tenant_id,
                summary="Destek girişi sona erdi", details={"staff_id": staff.id, "duration_seconds": duration})
    await db.commit()
