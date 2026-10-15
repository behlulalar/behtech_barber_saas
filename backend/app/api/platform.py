"""Platform sahibi (SaaS owner) route'ları. Tenant'tan bağımsızdır, Host header'ına bakmaz."""
from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.password_policy import enforce_password_policy

from app.core.database import get_db
from app.core.deps import get_current_platform_admin
from app.core.security import create_access_token, hash_password, verify_password
from app.models.appointment import Appointment
from app.models.platform_admin import PlatformAdmin
from app.models.tenant import Tenant
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.platform import (
    AuditActionOut,
    AuditPage,
    ImpersonateIn,
    ImpersonateOut,
    JobRunOut,
    MetricsOverview,
    OwnerPasswordOut,
    OwnerPasswordReset,
    OwnerUpdate,
    PasswordChangeIn,
    PasswordResetIn,
    PlatformAdminCreate,
    PlatformAdminOut,
    PlatformAdminUpdate,
    PlatformMe,
    PlatformStats,
    SystemStatus,
    TenantCreate,
    TenantUpdate,
)
from app.schemas.announcement import AnnouncementIn, AnnouncementOut, AnnouncementUpdate
from app.schemas.tenant import TenantDetailOut, TenantOption, TenantOut, TenantPage
from app.services import (
    announcement_services,
    audit_services,
    job_services,
    metrics_services,
    impersonation_services,
    login_throttle,
    platform_admin_services as admin_svc,
    platform_services,
    signup_services,
    system_services,
)
from app.services.audit_services import audit

router = APIRouter(prefix="/platform")


@router.post("/login", response_model=TokenResponse)
async def platform_login(data: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    key = login_throttle.make_key(data.phone)
    await login_throttle.ensure_not_locked(db, "platform", key, request)
    result = await db.execute(select(PlatformAdmin).where(PlatformAdmin.phone == data.phone))
    admin = result.scalar_one_or_none()
    # Pasif yönetici de aynı genel mesajla reddedilir (hesabın var/pasif olduğu sızmaz).
    if admin is None or not admin.is_active or not verify_password(data.password, admin.password):
        if await login_throttle.record_failure(db, "platform", key, request):
            await audit(db, actor=None, request=request, action="platform.login_locked",
                        actor_label=key, summary=f"{key} numarası için giriş çok fazla hatalı denemeden kilitlendi",
                        details={"phone": key, "lock_minutes": settings.login_lock_minutes})
            await db.commit()
            raise login_throttle.locked_now_error()
        raise HTTPException(status_code=401, detail="Telefon veya şifre hatalı")
    await login_throttle.clear_failures(db, "platform", key)
    admin.last_login_at = datetime.now()
    await audit(db, actor=admin, request=request, action="platform.login", entity_type="platform_admin",
                entity_id=admin.id, summary="Platform girişi yapıldı")
    await db.commit()
    token = create_access_token(
        {"sub": str(admin.id), "type": "platform_admin", "tv": admin.token_version},
        expires_minutes=settings.remember_token_expire_minutes if data.remember else None,
    )
    return TokenResponse(access_token=token, token_type="bearer")


@router.get("/me", response_model=PlatformMe)
async def platform_me(admin: PlatformAdmin = Depends(get_current_platform_admin)):
    return PlatformMe(id=admin.id, phone=admin.phone, name=admin.name)


@router.post("/me/password", response_model=TokenResponse)
async def platform_change_password(
    data: PasswordChangeIn,
    request: Request,
    admin: PlatformAdmin = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(data.current_password, admin.password):
        raise HTTPException(status_code=400, detail="Mevcut şifre hatalı")
    enforce_password_policy(data.new_password, admin.phone)
    admin.password = hash_password(data.new_password)
    admin.token_version += 1  # diğer cihazlardaki oturumlar düşer
    await audit(db, actor=admin, request=request, action="platform.password_changed",
                entity_type="platform_admin", entity_id=admin.id, summary="Şifre değiştirildi")
    await db.commit()
    token = create_access_token({"sub": str(admin.id), "type": "platform_admin", "tv": admin.token_version})
    return TokenResponse(access_token=token, token_type="bearer")


@router.post("/me/logout-all", status_code=204)
async def platform_logout_all(
    request: Request,
    admin: PlatformAdmin = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    admin.token_version += 1
    await audit(db, actor=admin, request=request, action="platform.logout_all",
                entity_type="platform_admin", entity_id=admin.id, summary="Tüm cihazlardan çıkış yapıldı")
    await db.commit()
    return Response(status_code=204)


# Yöneticiler
@router.get("/admins", response_model=list[PlatformAdminOut])
async def list_admins(admin: PlatformAdmin = Depends(get_current_platform_admin), db: AsyncSession = Depends(get_db)):
    return await admin_svc.list_admins(db, admin)


@router.post("/admins", response_model=PlatformAdminOut, status_code=201)
async def create_admin(
    data: PlatformAdminCreate,
    request: Request,
    admin: PlatformAdmin = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    return await admin_svc.create_admin(db, admin, data, request)


@router.patch("/admins/{admin_id}", response_model=PlatformAdminOut)
async def update_admin(
    admin_id: int,
    data: PlatformAdminUpdate,
    request: Request,
    admin: PlatformAdmin = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    return await admin_svc.update_admin(db, admin, admin_id, data, request)


@router.post("/admins/{admin_id}/reset-password", status_code=204)
async def reset_admin_password(
    admin_id: int,
    data: PasswordResetIn,
    request: Request,
    admin: PlatformAdmin = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    await admin_svc.reset_password(db, admin, admin_id, data.password, request)
    return Response(status_code=204)


@router.delete("/admins/{admin_id}", status_code=204)
async def delete_admin(
    admin_id: int,
    request: Request,
    admin: PlatformAdmin = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    await admin_svc.delete_admin(db, admin, admin_id, request)
    return Response(status_code=204)


# Denetim kaydı, işler, sistem durumu
@router.get("/audit/actions", response_model=list[AuditActionOut])
async def audit_actions(admin: PlatformAdmin = Depends(get_current_platform_admin)):
    return audit_services.actions_catalog()


@router.get("/audit", response_model=AuditPage)
async def audit_list(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    action: str | None = None,
    group: str | None = None,
    tenant_id: int | None = None,
    actor_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = None,
    admin: PlatformAdmin = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    return await audit_services.list_audit(
        db, limit=limit, offset=offset, action=action or None, group=group or None, tenant_id=tenant_id,
        actor_id=actor_id, date_from=date_from, date_to=date_to, q=q,
    )


@router.get("/jobs/runs", response_model=list[JobRunOut])
async def job_runs(
    job: str | None = None,
    limit: int = Query(default=20, ge=1, le=200),
    admin: PlatformAdmin = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    return await job_services.list_runs(db, job, limit)


@router.get("/system/status", response_model=SystemStatus)
async def system_status(admin: PlatformAdmin = Depends(get_current_platform_admin), db: AsyncSession = Depends(get_db)):
    return await system_services.get_status(db)


@router.get("/metrics/overview", response_model=MetricsOverview)
async def platform_metrics_overview(
    admin: PlatformAdmin = Depends(get_current_platform_admin), db: AsyncSession = Depends(get_db)
):
    return await metrics_services.overview(db)


@router.get("/stats", response_model=PlatformStats)
async def platform_stats(
    admin: PlatformAdmin = Depends(get_current_platform_admin), db: Session = Depends(get_db)
):
    tenant_count = (await db.execute(select(func.count(Tenant.id)))).scalar_one()
    active_count = (
        await db.execute(select(func.count(Tenant.id)).where(Tenant.is_active == True))  # noqa: E712
    ).scalar_one()
    total = (await db.execute(select(func.count(Appointment.id)))).scalar_one()
    today = date.today()
    last_30 = (
        await db.execute(
            select(func.count(Appointment.id)).where(
                Appointment.appointment_date >= today - timedelta(days=30),
                Appointment.appointment_date <= today,
            )
        )
    ).scalar_one()
    return PlatformStats(
        tenant_count=tenant_count,
        active_tenant_count=active_count,
        total_appointments=total,
        appointments_last_30_days=last_30,
    )


@router.get("/tenants", response_model=TenantPage)
async def platform_list_tenants(
    search: str | None = Query(default=None, max_length=100),
    status: Literal["all", "active", "inactive", "suspended", "pending"] = "all",
    sort: Literal["name", "-name", "created", "-created", "staff", "-staff", "appointments", "-appointments"] = "-created",
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    admin: PlatformAdmin = Depends(get_current_platform_admin),
    db: Session = Depends(get_db),
):
    return await platform_services.list_tenants(db, search=search, status=status, sort=sort, limit=limit, offset=offset)


@router.get("/announcements", response_model=list[AnnouncementOut])
async def platform_list_announcements(admin: PlatformAdmin = Depends(get_current_platform_admin), db: Session = Depends(get_db)):
    return await announcement_services.list_all(db)


@router.post("/announcements", response_model=AnnouncementOut, status_code=201)
async def platform_create_announcement(
    data: AnnouncementIn, request: Request,
    admin: PlatformAdmin = Depends(get_current_platform_admin), db: Session = Depends(get_db),
):
    return await announcement_services.create(db, data, admin, request)


@router.patch("/announcements/{announcement_id}", response_model=AnnouncementOut)
async def platform_update_announcement(
    announcement_id: int, data: AnnouncementUpdate, request: Request,
    admin: PlatformAdmin = Depends(get_current_platform_admin), db: Session = Depends(get_db),
):
    return await announcement_services.update(db, announcement_id, data, admin, request)


@router.delete("/announcements/{announcement_id}", status_code=204)
async def platform_delete_announcement(
    announcement_id: int, request: Request,
    admin: PlatformAdmin = Depends(get_current_platform_admin), db: Session = Depends(get_db),
):
    await announcement_services.delete_one(db, announcement_id, admin, request)
    return Response(status_code=204)


@router.get("/tenants/options", response_model=list[TenantOption])
async def platform_tenant_options(admin: PlatformAdmin = Depends(get_current_platform_admin), db: Session = Depends(get_db)):
    return await platform_services.list_options(db)


@router.get("/tenants/{tenant_id}", response_model=TenantDetailOut)
async def platform_get_tenant(
    tenant_id: int, admin: PlatformAdmin = Depends(get_current_platform_admin), db: Session = Depends(get_db)
):
    return await platform_services.get_tenant_detail(db, tenant_id)


@router.post("/tenants", response_model=TenantOut)
async def platform_create_tenant(
    data: TenantCreate,
    request: Request,
    admin: PlatformAdmin = Depends(get_current_platform_admin),
    db: Session = Depends(get_db),
):
    return await platform_services.create_tenant(db, data, admin, request)


@router.post("/tenants/{tenant_id}/signup/approve", response_model=TenantOut)
async def platform_approve_signup(
    tenant_id: int, request: Request,
    admin: PlatformAdmin = Depends(get_current_platform_admin), db: Session = Depends(get_db),
):
    return await signup_services.approve(db, tenant_id, admin, request)


@router.post("/tenants/{tenant_id}/signup/reject", response_model=TenantOut)
async def platform_reject_signup(
    tenant_id: int, request: Request,
    admin: PlatformAdmin = Depends(get_current_platform_admin), db: Session = Depends(get_db),
):
    return await signup_services.reject(db, tenant_id, admin, request)


@router.patch("/tenants/{tenant_id}", response_model=TenantOut)
async def platform_update_tenant(
    tenant_id: int,
    data: TenantUpdate,
    request: Request,
    admin: PlatformAdmin = Depends(get_current_platform_admin),
    db: Session = Depends(get_db),
):
    return await platform_services.update_tenant(
        db, tenant_id, data.name, data.is_active, data.note, admin, request
    )


@router.patch("/tenants/{tenant_id}/owner", response_model=TenantDetailOut)
async def platform_update_owner(
    tenant_id: int,
    data: OwnerUpdate,
    request: Request,
    admin: PlatformAdmin = Depends(get_current_platform_admin),
    db: Session = Depends(get_db),
):
    return await platform_services.update_owner(db, tenant_id, data, admin, request)


@router.post("/tenants/{tenant_id}/owner/reset-password", response_model=OwnerPasswordOut)
async def platform_reset_owner_password(
    tenant_id: int,
    request: Request,
    data: OwnerPasswordReset | None = None,
    admin: PlatformAdmin = Depends(get_current_platform_admin),
    db: Session = Depends(get_db),
):
    pw = await platform_services.reset_owner_password(db, tenant_id, data.password if data else None, admin, request)
    return OwnerPasswordOut(password=pw)


@router.post("/tenants/{tenant_id}/impersonate", response_model=ImpersonateOut)
async def platform_impersonate(
    tenant_id: int,
    request: Request,
    data: ImpersonateIn | None = None,
    admin: PlatformAdmin = Depends(get_current_platform_admin),
    db: Session = Depends(get_db),
):
    """Destek girişi için 60 sn geçerli tek kullanımlık kod üretir."""
    return await impersonation_services.start(db, tenant_id, data or ImpersonateIn(), admin, request)
