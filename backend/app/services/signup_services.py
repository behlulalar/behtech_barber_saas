"""İşletme kendi kayıt olur (demo/deneme hesabı): hesap 'onay bekliyor' açılır, platform yöneticisi onaylar."""
import logging
from datetime import datetime, timedelta

from fastapi import HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.legal import TENANT_TERMS_VERSION
from app.core.net import client_ip
from app.core.password_policy import enforce_password_policy
from app.core.security import hash_password
from app.models.login_attempt import LoginAttempt
from app.models.platform_admin import PlatformAdmin
from app.models.staff import RoleType, Staff
from app.models.tenant import Tenant
from app.models.tenant_settings import TenantSettings
from app.schemas.signup import SignupRequest
from app.services import billing_services, consent_services, notify_services
from app.services.audit_services import audit
from app.services.platform_services import get_tenant_out, validate_slug

logger = logging.getLogger(__name__)

SIGNUP_SCOPE = "signup"
SIGNUP_IP_LIMIT_PER_DAY = 5
TRIAL_DAYS = 14


async def _check_ip_limit(db: AsyncSession, ip: str | None) -> None:
    if not ip:
        return
    count = (await db.execute(
        select(func.count()).where(
            LoginAttempt.scope == SIGNUP_SCOPE, LoginAttempt.ip == ip,
            LoginAttempt.created_at > datetime.now() - timedelta(hours=24),
        )
    )).scalar_one()
    if count >= SIGNUP_IP_LIMIT_PER_DAY:
        raise HTTPException(status_code=429, detail="Bu bağlantıdan çok fazla kayıt denendi, lütfen yarın tekrar deneyin")


async def signup(db: AsyncSession, data: SignupRequest, request: Request) -> Tenant:
    if not data.accept_terms:
        raise HTTPException(status_code=400, detail="Devam etmek için kullanım şartlarını ve veri işleme sözleşmesini onaylayın")
    ip = client_ip(request)
    await _check_ip_limit(db, ip)
    validate_slug(data.slug)
    enforce_password_policy(data.password, data.owner_phone)
    if (await db.execute(select(Tenant.id).where(Tenant.slug == data.slug))).first() is not None:
        raise HTTPException(status_code=409, detail="Bu adres zaten kullanılıyor")
    # Aynı telefonla ikinci kayıt: yalnızca bekleyen/onaylı başvuru varsa engelle (reddedilen yeniden deneyebilir).
    dup = await db.execute(
        select(Tenant.id).join(Staff, Staff.tenant_id == Tenant.id).where(
            Staff.phone == data.owner_phone, Staff.role == RoleType.SUPER_ADMIN, Tenant.signup_status.in_(("pending", "approved"))
        ).limit(1)
    )
    if dup.first() is not None:
        raise HTTPException(status_code=409, detail="Bu telefon numarasıyla zaten bir kayıt başvurusu var")

    try:
        tenant = Tenant(name=data.name.strip(), slug=data.slug, is_active=False, signup_status="pending")
        db.add(tenant)
        await db.flush()
        db.add(TenantSettings(tenant_id=tenant.id, business_name=tenant.name, business_adress=""))
        db.add(Staff(
            tenant_id=tenant.id, name=data.owner_name.strip(), surname=data.owner_surname.strip(),
            phone=data.owner_phone, password=hash_password(data.password), role=RoleType.SUPER_ADMIN,
        ))
        await consent_services.record_consent(
            db, consent_services.TENANT_TERMS, tenant.id, data.owner_phone, TENANT_TERMS_VERSION, request
        )
        db.add(LoginAttempt(scope=SIGNUP_SCOPE, key=data.owner_phone, ip=ip, success=True, created_at=datetime.now()))
        await audit(db, actor=None, request=request, action="tenant.signup", entity_type="tenant",
                    entity_id=tenant.id, tenant_id=tenant.id,
                    summary=f"'{tenant.name}' kendi kayıt oldu (onay bekliyor)",
                    details={"slug": tenant.slug, "owner_phone": data.owner_phone, "email": data.email})
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Bu adres zaten kullanılıyor")

    await _notify_platform(db, tenant, data)
    return tenant


async def _notify_platform(db: AsyncSession, tenant: Tenant, data: SignupRequest) -> None:
    """Yeni başvuruyu platform sahibine bildirir (e-posta + push). Hatalar kaydı bozmaz."""
    try:
        ps = await billing_services.get_settings_row(db)
        owner = f"{data.owner_name} {data.owner_surname}"
        text = (f"Yeni işletme başvurusu: {tenant.name} ({tenant.slug})\nSahip: {owner}, {data.owner_phone}"
                f"\nE-posta: {data.email or '-'}\nPlatform panelinden onaylayın.")
        html = "<p>" + text.replace("\n", "<br>") + "</p>"
        await notify_services.send_email(ps.notify_email, f"BehTech: yeni başvuru - {tenant.name}", html, text)
        await notify_services.send_push_to_all(db, "Yeni işletme başvurusu", f"{tenant.name} onay bekliyor", "/platform/isletmeler")
    except Exception:
        logger.exception("Signup notification failed")


async def _pending(db: AsyncSession, tenant_id: int) -> Tenant:
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status_code=404, detail="İşletme bulunamadı")
    if tenant.signup_status != "pending":
        raise HTTPException(status_code=409, detail="Bu başvuru onay beklemiyor")
    return tenant


async def approve(db: AsyncSession, tenant_id: int, actor: PlatformAdmin, request: Request):
    tenant = await _pending(db, tenant_id)
    tenant.signup_status = "approved"
    tenant.is_active = True
    tenant.auto_suspended_at = None
    await billing_services.add_trial(db, tenant, TRIAL_DAYS, None, actor, request)
    await audit(db, actor=actor, request=request, action="tenant.signup_approve", entity_type="tenant",
                entity_id=tenant.id, tenant_id=tenant.id, summary=f"'{tenant.name}' başvurusu onaylandı, {TRIAL_DAYS} günlük deneme başladı")
    await db.commit()
    return await get_tenant_out(db, tenant.id)


async def reject(db: AsyncSession, tenant_id: int, actor: PlatformAdmin, request: Request):
    tenant = await _pending(db, tenant_id)
    tenant.signup_status = "rejected"
    await audit(db, actor=actor, request=request, action="tenant.signup_reject", entity_type="tenant",
                entity_id=tenant.id, tenant_id=tenant.id, summary=f"'{tenant.name}' başvurusu reddedildi")
    await db.commit()
    return await get_tenant_out(db, tenant.id)
