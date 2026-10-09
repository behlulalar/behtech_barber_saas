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
from app.schemas.service import ServiceOut
from app.models.service import Service
from datetime import date 
from app.models.appointment import Appointment, AppointmentStatus



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

@app.get("/staff", response_model=list[StaffOut])
async def staff_route(tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    result = await db.execute(select(Staff).where(Staff.tenant_id == tenant.id))
    all_staff = result.scalars().all()
    return all_staff

@app.get("/services", response_model=list[ServiceOut])
async def services_route(tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    result = await db.execute(select(Service).where(Service.tenant_id == tenant.id, Service.is_active == True))
    all_services = result.scalars().all()
    return all_services

@app.get("/booked-times")
async def booked_times_route(staff_id: int, date: date, tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    result = await db.execute(select(Appointment.appointment_time).where(Appointment.tenant_id == tenant.id, Appointment.staff_id == staff_id, Appointment.appointment_date == date, Appointment.status != AppointmentStatus.CANCELLED))
    all_appointments = result.scalars().all()
    return all_appointments
    