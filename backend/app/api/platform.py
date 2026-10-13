"""Platform sahibi (SaaS owner) route'ları. Tenant'tan bağımsızdır, Host header'ına bakmaz."""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_platform_admin
from app.core.security import create_access_token, verify_password
from app.models.appointment import Appointment
from app.models.platform_admin import PlatformAdmin
from app.models.tenant import Tenant
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.platform import PlatformMe, PlatformStats, TenantCreate, TenantUpdate
from app.schemas.tenant import TenantOut
from app.services import platform_services

router = APIRouter(prefix="/platform")


@router.post("/login", response_model=TokenResponse)
async def platform_login(data: LoginRequest, db: Session = Depends(get_db)):
    result = await db.execute(select(PlatformAdmin).where(PlatformAdmin.phone == data.phone))
    admin = result.scalar_one_or_none()
    if admin is None or not verify_password(data.password, admin.password):
        raise HTTPException(status_code=401, detail="Telefon veya şifre hatalı")
    token = create_access_token({"sub": str(admin.id), "type": "platform_admin"})
    return TokenResponse(access_token=token, token_type="bearer")


@router.get("/me", response_model=PlatformMe)
async def platform_me(admin: PlatformAdmin = Depends(get_current_platform_admin)):
    return PlatformMe(id=admin.id, phone=admin.phone)


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


@router.get("/tenants", response_model=list[TenantOut])
async def platform_list_tenants(
    admin: PlatformAdmin = Depends(get_current_platform_admin), db: Session = Depends(get_db)
):
    return await platform_services.list_tenants(db)


@router.post("/tenants", response_model=TenantOut)
async def platform_create_tenant(
    data: TenantCreate,
    admin: PlatformAdmin = Depends(get_current_platform_admin),
    db: Session = Depends(get_db),
):
    return await platform_services.create_tenant(db, data)


@router.patch("/tenants/{tenant_id}", response_model=TenantOut)
async def platform_update_tenant(
    tenant_id: int,
    data: TenantUpdate,
    admin: PlatformAdmin = Depends(get_current_platform_admin),
    db: Session = Depends(get_db),
):
    return await platform_services.update_tenant(db, tenant_id, data.name, data.is_active)
