from sqlalchemy import select
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.appointment import Appointment, AppointmentStatus
from app.models.working_hours import WorkingHours
from app.models.time_off import TimeOff
from app.models.service import Service
from app.models.staff import Staff
from app.models.staff_service import StaffService
from datetime import date, time, datetime, timedelta
from app.core.config import settings

SLOT_STEP_MINUTES = 15


def _js_day_of_week(d: date) -> int:
    # Eski sistem (ve migrate edilen veri) day_of_week'i JS'in getDay()
    # kuralıyla saklıyor: 0=Pazar, 1=Pazartesi, ... 6=Cumartesi.
    # Python'ın date.weekday()'i ise 0=Pazartesi'dir, bu yüzden çeviriyoruz.
    return (d.weekday() + 1) % 7


async def lock_staff_schedule(db: Session, tenant_id: int, staff_id: int) -> None:
    # Unique index yalnızca birebir aynı başlangıç saatini korur; 15:00 ve 15:15 gibi örtüşen iki
    # eşzamanlı rezervasyonu engellemez. Berberin satırını transaction sonuna (commit/rollback)
    # kadar kilitleyerek aynı berbere gelen rezervasyonları sıraya sokuyoruz.
    # Bu yüzden kilitten sonra commit eden bir şey (ör. get_or_create_customer) çağrılmamalı.
    await db.execute(
        select(Staff.id).where(Staff.id == staff_id, Staff.tenant_id == tenant_id).with_for_update()
    )


async def get_available_slots(
    db: Session, tenant_id: int, staff_id: int, service_id: int, appointment_date: date
) -> list[time]:
    service_result = await db.execute(
        select(Service).where(Service.id == service_id, Service.tenant_id == tenant_id)
    )
    service = service_result.scalar_one_or_none()
    if service is None:
        raise HTTPException(status_code=404, detail="Hizmet bulunamadı")

    # Berber yalnızca kendisine bağlı hizmetleri verir (staff_services).
    provides = await db.execute(
        select(StaffService.id).where(
            StaffService.tenant_id == tenant_id,
            StaffService.staff_id == staff_id,
            StaffService.service_id == service_id,
        )
    )
    if provides.first() is None:
        raise HTTPException(status_code=400, detail="Seçilen berber bu hizmeti vermiyor")

    time_off_result = await db.execute(
        select(TimeOff).where(
            TimeOff.tenant_id == tenant_id,
            TimeOff.staff_id == staff_id,
            TimeOff.start_date <= appointment_date,
            TimeOff.end_date >= appointment_date,
        )
    )
    if time_off_result.scalar_one_or_none() is not None:
        return []

    working_hours_result = await db.execute(
        select(WorkingHours).where(
            WorkingHours.tenant_id == tenant_id,
            WorkingHours.staff_id == staff_id,
            WorkingHours.day_of_week == _js_day_of_week(appointment_date),
        )
    )
    working_hours = working_hours_result.scalar_one_or_none()
    if working_hours is None:
        return []

    appointments_result = await db.execute(
        select(Appointment.appointment_time, Service.duration_min)
        .join(Service, Appointment.service_id == Service.id)
        .where(
            Appointment.tenant_id == tenant_id,
            Appointment.staff_id == staff_id,
            Appointment.appointment_date == appointment_date,
            Appointment.status != AppointmentStatus.CANCELLED,
        )
    )
    busy_intervals = [
        (
            datetime.combine(appointment_date, existing_time),
            datetime.combine(appointment_date, existing_time) + timedelta(minutes=existing_duration),
        )
        for existing_time, existing_duration in appointments_result.all()
    ]

    work_start = datetime.combine(appointment_date, working_hours.start_time)
    work_end = datetime.combine(appointment_date, working_hours.end_time)
    if work_end <= work_start:
        # Bitiş 00:00 ("gece yarısına kadar açığız") ya da bitiş <= başlangıç: günün sonu kabul edilir.
        work_end += timedelta(days=1)
    service_duration = timedelta(minutes=service.duration_min)
    step = timedelta(minutes=SLOT_STEP_MINUTES)

    available_slots: list[time] = []
    candidate = work_start
    while candidate + service_duration <= work_end:
        candidate_end = candidate + service_duration
        overlaps = any(candidate < busy_end and candidate_end > busy_start for busy_start, busy_end in busy_intervals)
        if not overlaps:
            available_slots.append(candidate.time())
        candidate += step

    return available_slots


async def check_daily_limit(db: Session, tenant_id: int, customer_id: int, appointment_date: date) -> None:
    query = select(Appointment).where(Appointment.tenant_id == tenant_id, Appointment.customer_id == customer_id, Appointment.appointment_date == appointment_date, Appointment.status != AppointmentStatus.CANCELLED)
    result = await db.execute(query)
    all_appointments = result.scalars().all()

    if len(all_appointments) >= settings.daily_appointment_limit: 
        raise HTTPException(status_code=400, detail="Günlük randevu alma limitini aştınız.")

async def check_slot_available(db: Session, staff_id: int, appointment_date: date, appointment_time: time) -> None:
    query = select(Appointment).where(Appointment.staff_id == staff_id, Appointment.appointment_date == appointment_date, Appointment.appointment_time == appointment_time, Appointment.status != AppointmentStatus.CANCELLED)
    result = await db.execute(query)
    all_available_slots = result.scalar_one_or_none()

    if all_available_slots is not None:
        raise HTTPException(status_code=409, detail="Bu randevu dolu, lütfen başka bir saat deneyin!")
     