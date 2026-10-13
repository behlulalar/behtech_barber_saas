"""Herkese açık (müşteri tarafı) ve müşteri (OTP token'lı) route'ları. Tenant, Host header'ından çözülür."""
import logging
from datetime import date

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_tenant
from app.models.appointment import Appointment, AppointmentStatus
from app.models.service import Service
from app.models.staff import Staff
from app.models.tenant import Tenant
from app.schemas.appointment import AppointmentCreate, AppointmentOut
from app.schemas.otp import SendCodeRequest, VerifyCodeRequest
from app.schemas.service import ServiceOut
from app.schemas.staff import StaffOut
from app.services.appointment_services import check_daily_limit, check_slot_available, get_available_slots
from app.services.customer_services import get_or_create_customer
from app.services.otp_services import send_code, verify_code

router = APIRouter()
logger = logging.getLogger("evolution_webhook")


@router.get("/health")
async def health_check():
    return {"status": "healthy 200 OK"}


@router.get("/staff", response_model=list[StaffOut])
async def staff_route(tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    result = await db.execute(select(Staff).where(Staff.tenant_id == tenant.id))
    return result.scalars().all()


@router.get("/services", response_model=list[ServiceOut])
async def services_route(tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    result = await db.execute(select(Service).where(Service.tenant_id == tenant.id, Service.is_active == True))
    return result.scalars().all()


@router.get("/booked-times")
async def booked_times_route(staff_id: int, date: date, tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    result = await db.execute(select(Appointment.appointment_time).where(Appointment.tenant_id == tenant.id, Appointment.staff_id == staff_id, Appointment.appointment_date == date, Appointment.status != AppointmentStatus.CANCELLED))
    return result.scalars().all()


@router.get("/availability")
async def availability_route(
    staff_id: int,
    service_id: int,
    date: date,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    return await get_available_slots(db, tenant.id, staff_id, service_id, date)


@router.post("/appointments", response_model=AppointmentOut)
async def appointment_create(
    data: AppointmentCreate,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    customer = await get_or_create_customer(db, tenant.id, data.phone, data.name, data.surname)
    await check_daily_limit(db, tenant.id, customer.id, data.appointment_date)
    await check_slot_available(db, data.staff_id, data.appointment_date, data.appointment_time)

    new_appointment = Appointment(
        tenant_id=tenant.id,
        customer_id=customer.id,
        staff_id=data.staff_id,
        service_id=data.service_id,
        appointment_date=data.appointment_date,
        appointment_time=data.appointment_time,
        status=AppointmentStatus.PENDING,
    )
    db.add(new_appointment)
    await db.commit()
    await db.refresh(new_appointment)
    return new_appointment


@router.post("/auth/send-code")
async def send_code_route(data: SendCodeRequest, tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    code = await send_code(db, tenant.id, data.phone)
    return {"message": "Kod gönderildi (test modu)", "kod": code}


@router.post("/auth/verify_code")
async def verify_code_request(data: VerifyCodeRequest, tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    await verify_code(db, tenant.id, data.phone, data.code)
    return {"message": "Doğrulama başarılı"}


@router.post("/webhooks/evolution")
async def evolution_webhook(request: Request):
    # Evolution API'nin gerçek payload yapısı henüz doğrulanmadı (bkz. CLAUDE.md).
    payload = await request.json()
    logger.info("Evolution webhook payload: %s", payload)
    return {"status": "received"}
