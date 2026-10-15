from dataclasses import dataclass

from fastapi.security import OAuth2PasswordBearer
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.core.database import SessionFactory, get_db
from app.core.security import decode_access_token
from app.models.staff import Staff, RoleType
from app.models.tenant import Tenant
from app.models.platform_admin import PlatformAdmin
from app.core.config import settings
import jwt

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
platform_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/platform/login")
customer_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/verify-code")

MANAGER_ROLES = {RoleType.SUPER_ADMIN, RoleType.TECHNICAL_SUPPORT}

_INVALID = HTTPException(status_code=401, detail="Oturum geçersiz, lütfen tekrar giriş yapın")


def _decode(token: str, expected_type: str) -> dict:
    try:
        payload = decode_access_token(token)
    except jwt.InvalidTokenError:
        raise _INVALID
    if payload.get("type") != expected_type:
        raise _INVALID
    return payload


async def get_current_tenant(request: Request, db: Session = Depends(get_db)) -> Tenant:
    host = request.headers.get("host", "")
    host = host.split(":")[0]

    suffix = f".{settings.base_domain}"
    if not host.endswith(suffix):
        raise HTTPException(status_code=400, detail="İşletme adresi çözümlenemedi")

    slug = host[: -len(suffix)]

    result = await db.execute(select(Tenant).where(Tenant.slug == slug))
    tenant = result.scalar_one_or_none()

    if tenant is None:
        raise HTTPException(status_code=404, detail="İşletme bulunamadı")
    if not tenant.is_active:
        if tenant.signup_status == "pending":
            raise HTTPException(status_code=403, detail="Kayıt başvurunuz inceleniyor. Onaylanınca size haber vereceğiz")
        raise HTTPException(status_code=403, detail="Bu işletme şu an hizmet vermiyor")

    return tenant


READ_METHODS = {"GET", "HEAD", "OPTIONS"}
RO_MSG = "Destek modu salt görüntüleme: değişiklik yapılamaz"
IMPERSONATE_END_PATH = "/api/auth/impersonate/end"


async def get_current_staff(
    request: Request,
    token: str = Depends(oauth2_scheme),
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> Staff:
    payload = _decode(token, "staff")
    result = await db.execute(select(Staff).where(Staff.id == int(payload["sub"])))
    staff = result.scalar_one_or_none()
    # Bir dükkânın token'ı başka bir dükkânın subdomain'inde kullanılamaz.
    if staff is None or staff.tenant_id != tenant.id:
        raise _INVALID
    # İşten ayrılan (pasif) personelin açık oturumları geçersizdir.
    if not staff.is_active:
        raise _INVALID
    # Şifre değişince sürüm artar; sürümü olmayan eski token'lar 0 sayılır.
    if payload.get("tv", 0) != staff.token_version:
        raise _INVALID
    imp = payload.get("imp")
    if imp is not None:
        # Destek oturumu: yönetici pasifleştirilir/silinirse oturum anında düşer.
        admin = (await db.execute(select(PlatformAdmin).where(PlatformAdmin.id == int(imp)))).scalar_one_or_none()
        if admin is None or not admin.is_active:
            raise _INVALID
        read_only = bool(payload.get("ro"))
        request.state.impersonator = admin
        request.state.impersonation_started = payload.get("iat_imp")
        request.state.read_only = read_only
        # Oturumu bitirme salt görüntülemede de serbest; ayrı bir impersonation.end kaydı yazar.
        if request.method not in READ_METHODS and request.url.path != IMPERSONATE_END_PATH:
            if read_only:
                raise HTTPException(status_code=403, detail=RO_MSG)
            # Gövde (body) ASLA yazılmaz; ayrı oturum: işlem rollback olsa da deneme izi kalsın.
            from app.services.audit_services import audit
            async with SessionFactory() as audit_db:
                await audit(audit_db, actor=admin, request=request, action="impersonation.action",
                            entity_type="tenant", entity_id=tenant.id, tenant_id=tenant.id,
                            summary=f"Destek modunda: {request.method} {request.url.path}",
                            details={"staff_id": staff.id, "method": request.method, "path": request.url.path})
                await audit_db.commit()
    return staff


async def require_manager(staff: Staff = Depends(get_current_staff)) -> Staff:
    if staff.role not in MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Bu işlem için yönetici yetkisi gerekiyor")
    return staff


def is_manager(staff: Staff) -> bool:
    return staff.role in MANAGER_ROLES


@dataclass
class CustomerIdentity:
    phone: str
    tenant_id: int


async def get_current_customer(
    token: str = Depends(customer_oauth2_scheme),
    tenant: Tenant = Depends(get_current_tenant),
) -> CustomerIdentity:
    """OTP ile doğrulanmış telefon. Müşteri kaydı henüz olmayabilir (ilk randevuda oluşur)."""
    payload = _decode(token, "customer")
    if payload.get("tenant_id") != tenant.id or not payload.get("phone"):
        raise _INVALID
    return CustomerIdentity(phone=payload["phone"], tenant_id=tenant.id)


async def get_current_platform_admin(
    token: str = Depends(platform_oauth2_scheme), db: Session = Depends(get_db)
) -> PlatformAdmin:
    payload = _decode(token, "platform_admin")
    result = await db.execute(select(PlatformAdmin).where(PlatformAdmin.id == int(payload["sub"])))
    admin = result.scalar_one_or_none()
    if admin is None or not admin.is_active or payload.get("tv", 0) != admin.token_version:
        raise _INVALID
    return admin
