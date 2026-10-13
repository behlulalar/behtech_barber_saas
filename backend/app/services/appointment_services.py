from sqlalchemy import select 
from sqlalchemy.orm import Session
from fastapi import HTTPException 
from app.models.appointment import Appointment, AppointmentStatus
from datetime import date, time
from app.core.config import settings


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
     