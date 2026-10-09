from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.tenant import Tenant
from app.models.staff import Staff
from sqlalchemy import select
from app.schemas.tenant import TenantOut
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.staff import StaffOut
from app.core.security import verify_password, create_access_token
from app.core.deps import get_current_staff, get_current_tenant


app = FastAPI()

@app.get("/health")
async def health_check():
    return {"status": "healthy 200 OK"}

@app.get("/tenants", response_model=list[TenantOut])
async def tenants_route(db: Session = Depends(get_db)):
    tenants = select(Tenant)
    result = await db.execute(tenants)
    all_tenants = result.scalars().all()
    return all_tenants

@app.post("/auth/login", response_model=TokenResponse)
async def login(data: LoginRequest, tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    staff_result = await db.execute(
        select(Staff).where(Staff.phone == data.phone, Staff.tenant_id == tenant.id)
    )
    staff = staff_result.scalar_one_or_none()
    if staff is None or not verify_password(data.password, staff.password):
        raise HTTPException(status_code=401, detail="Invalid phone or password")

    token = create_access_token({"sub": str(staff.id), "tenant_id": staff.tenant_id})
    return TokenResponse(access_token=token, token_type="bearer")

@app.get("/auth/me", response_model=StaffOut)
async def read_current_staff(current_staff: Staff = Depends(get_current_staff)):
    return current_staff


