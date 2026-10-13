from datetime import date, time
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from app.models.appointment import AppointmentStatus


def _normalize_time(value: time) -> time:
    # "09:00" ve "09:00:00" aynı değere insin; DB'deki slotlarla karşılaştırma bozulmasın.
    return value.replace(second=0, microsecond=0, tzinfo=None)


NormalizedTime = Annotated[time, AfterValidator(_normalize_time)]


class AppointmentCreate(BaseModel):
    """Müşteri randevu isteği. Telefon body'den DEĞİL, OTP token'ından gelir."""
    name: str = Field(min_length=1, max_length=100)
    surname: str = Field(min_length=1, max_length=100)
    staff_id: int
    service_id: int
    appointment_date: date
    appointment_time: NormalizedTime


class AppointmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    staff_id: int
    service_id: int
    appointment_date: date
    appointment_time: time
    status: AppointmentStatus


class AppointmentServiceBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    price: int
    duration_min: int


class AppointmentStaffBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    surname: str


class AppointmentPublicOut(BaseModel):
    id: int
    appointment_date: date
    appointment_time: time
    status: AppointmentStatus
    service: AppointmentServiceBrief
    staff: AppointmentStaffBrief
