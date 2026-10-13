"""Dükkân personeli / yönetici paneli route'ları. Tenant, Host header'ından çözülür; staff token'ı o tenant'a ait olmalı."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_staff, get_current_tenant
from app.core.security import create_access_token, verify_password
from app.models.staff import Staff
from app.models.tenant import Tenant
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.staff import StaffOut

router = APIRouter()


@router.post("/auth/login", response_model=TokenResponse)
async def login(data: LoginRequest, tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    result = await db.execute(select(Staff).where(Staff.phone == data.phone, Staff.tenant_id == tenant.id))
    staff = result.scalar_one_or_none()
    if staff is None or not verify_password(data.password, staff.password):
        raise HTTPException(status_code=401, detail="Telefon veya şifre hatalı")
    token = create_access_token({"sub": str(staff.id), "tenant_id": staff.tenant_id, "type": "staff"})
    return TokenResponse(access_token=token, token_type="bearer")


@router.get("/auth/me", response_model=StaffOut)
async def read_current_staff(current_staff: Staff = Depends(get_current_staff)):
    return current_staff
