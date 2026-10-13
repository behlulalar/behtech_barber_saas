from datetime import date, time
from pydantic import BaseModel, ConfigDict
from app.models.appointment import AppointmentStatus

class AppointmentCreate(BaseModel):
    phone: str
    name: str
    surname: str
    staff_id: int
    service_id: int
    appointment_date: date
    appointment_time: time

class AppointmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    staff_id: int
    service_id: int
    appointment_date: date
    appointment_time: time
    status: AppointmentStatus
