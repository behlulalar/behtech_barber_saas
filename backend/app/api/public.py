"""Herkese açık (müşteri tarafı) ve müşteri (OTP token'lı) route'ları. Tenant, Host header'ından çözülür."""
import logging
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import CustomerIdentity, get_current_customer, get_current_tenant
from app.core.security import create_access_token
from app.models.appointment import Appointment, AppointmentStatus
from app.models.customer import Customers
from app.models.service import Service
from app.models.staff import RoleType, Staff
from app.models.tenant import Tenant
from app.models.tenant_settings import TenantSettings
from app.schemas.appointment import AppointmentCreate, AppointmentPublicOut, SlotOut, SlotsResponse
from app.schemas.otp import SendCodeRequest, VerifyCodeRequest
from app.schemas.public import SendCodeResponse, StaffPublicOut, TenantPublicOut, VerifyCodeResponse
from app.schemas.service import ServiceOut
from app.services.admin_services import service_ids_by_staff
from app.services.appointment_services import (
    SLOT_MINUTES,
    build_slot_grid,
    check_daily_limit,
    get_available_slots,
    lock_staff_schedule,
)
from app.services.customer_services import get_or_create_customer
from app.services.otp_delivery import deliver_code
from app.services.otp_services import send_code, verify_code

router = APIRouter()
logger = logging.getLogger("evolution_webhook")

CUSTOMER_TOKEN_MINUTES = 30
CANCEL_MIN_HOURS = 2


@router.get("/health")
async def health_check():
    return {"status": "healthy 200 OK"}


@router.get("/public/tenant", response_model=TenantPublicOut)
async def public_tenant_route(tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    result = await db.execute(select(TenantSettings).where(TenantSettings.tenant_id == tenant.id))
    tenant_settings = result.scalar_one_or_none()
    return TenantPublicOut(
        name=tenant.name,
        slug=tenant.slug,
        business_name=tenant_settings.business_name if tenant_settings else tenant.name,
        business_address=(tenant_settings.business_adress or None) if tenant_settings else None,
        logo_image=tenant_settings.logo_image if tenant_settings else None,
        banner_image=tenant_settings.banner_image if tenant_settings else None,
        contact_phone=tenant_settings.contact_phone if tenant_settings else None,
        whatsapp_phone=tenant_settings.whatsapp_phone if tenant_settings else None,
        instagram=tenant_settings.instagram if tenant_settings else None,
    )


@router.get("/staff", response_model=list[StaffPublicOut])
async def staff_route(
    service_id: int | None = None, tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)
):
    """Berber listesi; service_id verilirse sadece o hizmeti veren berberler."""
    result = await db.execute(
        select(Staff)
        .where(Staff.tenant_id == tenant.id, Staff.role != RoleType.TECHNICAL_SUPPORT, Staff.is_active == True)  # noqa: E712
        .order_by(Staff.id)
    )
    links = await service_ids_by_staff(db, tenant.id)
    out = [
        StaffPublicOut.model_validate(s).model_copy(update={"service_ids": sorted(links.get(s.id, []))})
        for s in result.scalars().all()
    ]
    if service_id is not None:
        out = [s for s in out if service_id in s.service_ids]
    return out


@router.get("/services", response_model=list[ServiceOut])
async def services_route(tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    result = await db.execute(
        select(Service).where(Service.tenant_id == tenant.id, Service.is_active == True).order_by(Service.id)  # noqa: E712
    )
    return result.scalars().all()


@router.get("/availability")
async def availability_route(
    staff_id: int,
    service_id: int,
    date: date,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    # Motor geçmiş saatleri zaten eler; yalnızca seçilebilir (bookable) başlangıçlar döner.
    return await get_available_slots(db, tenant.id, staff_id, service_id, date)


def _hhmm(t: time, end: bool = False) -> str:
    return "24:00" if end and t == time(0, 0) else t.strftime("%H:%M")


@router.get("/availability/slots", response_model=SlotsResponse)
async def availability_slots_route(
    staff_id: int,
    service_id: int,
    date: date,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    grid = await build_slot_grid(db, tenant.id, staff_id, service_id, date)
    return SlotsResponse(
        date=grid.date,
        slot_minutes=SLOT_MINUTES,
        duration_slots=grid.duration_slots,
        closed_reason=grid.closed_reason,
        slots=[
            SlotOut(start=_hhmm(s.start), end=_hhmm(s.end, end=True), status=s.status, bookable=s.bookable)
            for s in grid.slots
        ],
    )


# ---------------------------------------------------------------- OTP auth

@router.post("/auth/send-code", response_model=SendCodeResponse)
async def send_code_route(
    data: SendCodeRequest, tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)
):
    code = await send_code(db, tenant.id, data.phone)
    # Geliştirmede no-op (kod dev_code ile döner); üretimde WhatsApp, başarısızsa 503.
    await deliver_code(data.phone, f"{tenant.name} randevu doğrulama kodunuz: {code}. Kodu kimseyle paylaşmayın.")
    is_dev = settings.environment == "development"
    return SendCodeResponse(message="Doğrulama kodu gönderildi", dev_code=code if is_dev else None)


@router.post("/auth/verify-code", response_model=VerifyCodeResponse)
async def verify_code_route(
    data: VerifyCodeRequest, tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)
):
    await verify_code(db, tenant.id, data.phone, data.code)
    token = create_access_token(
        {"type": "customer", "phone": data.phone, "tenant_id": tenant.id},
        expires_minutes=CUSTOMER_TOKEN_MINUTES,
    )
    result = await db.execute(
        select(Customers).where(Customers.tenant_id == tenant.id, Customers.phone == data.phone)
    )
    customer = result.scalar_one_or_none()
    return VerifyCodeResponse(access_token=token, token_type="bearer", customer=customer)


# ---------------------------------------------------------------- Appointments

def _public_query(tenant_id: int):
    return (
        select(Appointment, Service, Staff)
        .join(Service, Appointment.service_id == Service.id)
        .join(Staff, Appointment.staff_id == Staff.id)
        .where(Appointment.tenant_id == tenant_id)
    )


def _to_public(appointment: Appointment, service: Service, staff: Staff) -> AppointmentPublicOut:
    return AppointmentPublicOut(
        id=appointment.id,
        appointment_date=appointment.appointment_date,
        appointment_time=appointment.appointment_time,
        status=appointment.status,
        service=service,
        staff=staff,
    )


@router.post("/appointments", response_model=AppointmentPublicOut)
async def appointment_create(
    data: AppointmentCreate,
    identity: CustomerIdentity = Depends(get_current_customer),
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    now = datetime.now()
    if data.appointment_date < now.date():
        raise HTTPException(status_code=400, detail="Geçmiş bir tarihe randevu alınamaz")
    if datetime.combine(data.appointment_date, data.appointment_time) <= now:
        raise HTTPException(status_code=400, detail="Geçmiş bir saate randevu alınamaz")

    service = (
        await db.execute(select(Service).where(Service.id == data.service_id, Service.tenant_id == tenant.id))
    ).scalar_one_or_none()
    if service is None:
        raise HTTPException(status_code=404, detail="Hizmet bulunamadı")
    if not service.is_active:
        raise HTTPException(status_code=400, detail="Bu hizmet şu an verilmiyor")
    staff = (
        await db.execute(select(Staff).where(Staff.id == data.staff_id, Staff.tenant_id == tenant.id))
    ).scalar_one_or_none()
    if staff is None:
        raise HTTPException(status_code=404, detail="Berber bulunamadı")
    if not staff.is_active:
        raise HTTPException(status_code=400, detail="Berber bulunamadı")

    customer = await get_or_create_customer(db, tenant.id, identity.phone, data.name.strip(), data.surname.strip())
    await check_daily_limit(db, tenant.id, customer.id, data.appointment_date)

    # get_or_create_customer commit edebilir; kilit ondan SONRA alınmalı ki INSERT'e kadar sürsün.
    await lock_staff_schedule(db, tenant.id, data.staff_id)
    # Slot listesi: hizmet/berber bu dükkâna ait mi, çalışma saati, izin, çakışma — hepsini kapsar.
    slots = await get_available_slots(db, tenant.id, data.staff_id, data.service_id, data.appointment_date)
    if data.appointment_time not in {s.replace(second=0, microsecond=0) for s in slots}:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Bu saat artık müsait değil, lütfen başka bir saat seçin")

    # İptal edilen randevular yeni bir randevuyu engellemez (kısmi unique index: status <> 'cancelled');
    # iptal kaydı geçmiş olarak olduğu gibi kalır.
    appointment = Appointment(
        tenant_id=tenant.id,
        customer_id=customer.id,
        staff_id=data.staff_id,
        service_id=data.service_id,
        appointment_date=data.appointment_date,
        appointment_time=data.appointment_time,
        status=AppointmentStatus.CONFIRMED,  # işletme onayı beklenmez
    )
    db.add(appointment)
    try:
        await db.commit()
    except IntegrityError:
        # Aynı anda gelen iki istekten biri unique(staff, date, time) kısıtına takılır.
        await db.rollback()
        raise HTTPException(status_code=409, detail="Bu saat artık müsait değil, lütfen başka bir saat seçin")
    await db.refresh(appointment)
    return _to_public(appointment, service, staff)


@router.get("/customer/appointments", response_model=list[AppointmentPublicOut])
async def customer_appointments(
    identity: CustomerIdentity = Depends(get_current_customer),
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    query = (
        _public_query(tenant.id)
        .join(Customers, Appointment.customer_id == Customers.id)
        .where(Customers.phone == identity.phone, Customers.tenant_id == tenant.id)
        .order_by(Appointment.appointment_date.desc(), Appointment.appointment_time.desc())
    )
    rows = (await db.execute(query)).all()
    return [_to_public(a, s, st) for a, s, st in rows]


@router.post("/customer/appointments/{appointment_id}/cancel", response_model=AppointmentPublicOut)
async def customer_cancel_appointment(
    appointment_id: int,
    identity: CustomerIdentity = Depends(get_current_customer),
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    query = (
        _public_query(tenant.id)
        .join(Customers, Appointment.customer_id == Customers.id)
        .where(
            Appointment.id == appointment_id,
            Customers.phone == identity.phone,
            Customers.tenant_id == tenant.id,
        )
    )
    row = (await db.execute(query)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Randevu bulunamadı")
    appointment, service, staff = row

    if appointment.status not in (AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED):
        raise HTTPException(status_code=400, detail="Bu randevu iptal edilemez")
    start = datetime.combine(appointment.appointment_date, appointment.appointment_time)
    if start - datetime.now() < timedelta(hours=CANCEL_MIN_HOURS):
        raise HTTPException(
            status_code=400,
            detail=f"Randevuya {CANCEL_MIN_HOURS} saatten az kaldığı için iptal edilemez, lütfen işletmeyle iletişime geçin",
        )

    appointment.status = AppointmentStatus.CANCELLED
    await db.commit()
    await db.refresh(appointment)
    return _to_public(appointment, service, staff)


@router.post("/webhooks/evolution")
async def evolution_webhook(request: Request):
    # Evolution API'nin gerçek payload yapısı henüz doğrulanmadı (bkz. CLAUDE.md).
    payload = await request.json()
    logger.info("Evolution webhook payload: %s", payload)
    return {"status": "received"}
