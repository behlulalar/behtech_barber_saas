"""Platform sahibi (SaaS owner) route'ları. Tenant'tan bağımsızdır, Host header'ına bakmaz."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_platform_admin
from app.core.security import create_access_token, verify_password
from app.models.platform_admin import PlatformAdmin
from app.models.tenant import Tenant
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.tenant import TenantCreate, TenantOut

router = APIRouter(prefix="/platform")


@router.post("/login", response_model=TokenResponse)
async def platform_login(data: LoginRequest, db: Session = Depends(get_db)):
    result = await db.execute(select(PlatformAdmin).where(PlatformAdmin.phone == data.phone))
    admin = result.scalar_one_or_none()
    if admin is None or not verify_password(data.password, admin.password):
        raise HTTPException(status_code=401, detail="Telefon veya şifre hatalı")
    token = create_access_token({"sub": str(admin.id), "type": "platform_admin"})
    return TokenResponse(access_token=token, token_type="bearer")


@router.post("/tenants", response_model=TenantOut)
async def platform_create_tenant(
    data: TenantCreate,
    admin: PlatformAdmin = Depends(get_current_platform_admin),
    db: Session = Depends(get_db),
):
    new_tenant = Tenant(name=data.name, slug=data.slug)
    db.add(new_tenant)
    await db.commit()
    await db.refresh(new_tenant)
    return new_tenant


@router.get("/tenants", response_model=list[TenantOut])
async def platform_list_tenants(
    admin: PlatformAdmin = Depends(get_current_platform_admin),
    db: Session = Depends(get_db),
):
    result = await db.execute(select(Tenant))
    return result.scalars().all()
