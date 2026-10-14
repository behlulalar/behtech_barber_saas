"""Personel/yönetici paneli (admin.py) için istek ve yanıt şemaları."""
import re
from datetime import date, datetime, time
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

from app.models.appointment import AppointmentStatus
from app.models.staff import RoleType

_PHONE_RE = re.compile(r"^5\d{9}$")

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]


def _check_phone(value: str) -> str:
    value = value.strip()
    if not _PHONE_RE.match(value):
        raise ValueError("Telefon numarası 5 ile başlayan 10 haneli olmalı (örn. 5551234567)")
    return value


# ~1.5 MB'lık görsel base64 ile ~2.1M karakter eder.
_IMG_MAX_CHARS = 2_100_000
_IMG_RE = re.compile(r"^data:image/(png|jpe?g|webp|gif);base64,")


def _check_image(value: str | None) -> str | None:
    if value is None or value == "":
        return None
    if not _IMG_RE.match(value):
        raise ValueError("Görsel geçerli bir resim dosyası olmalı (PNG, JPEG, WebP, GIF)")
    if len(value) > _IMG_MAX_CHARS:
        raise ValueError("Görsel çok büyük, en fazla 1,5 MB olabilir")
    return value


# Personel fotoğrafı kartta büyük gösterildiği için (Retina'da ~1100x1350px) ayarlar
# görselleriyle aynı sınırı kullanır; tarayıcı 1400px'e küçültüp gönderir.
_check_photo = _check_image


IdList = Annotated[list[int], Field(max_length=500)]


class _Orm(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- auth ----------
class StaffMe(_Orm):
    id: int
    name: str
    surname: str
    phone: str
    role: RoleType | None


# ---------- nested refs ----------
class StaffRef(_Orm):
    id: int
    name: str
    surname: str


class ServiceRef(_Orm):
    id: int
    name: str
    price: int
    duration_min: int


class CustomerRef(_Orm):
    id: int
    name: str
    surname: str
    phone: str


# ---------- appointments ----------
class AdminAppointmentOut(BaseModel):
    id: int
    appointment_date: date
    appointment_time: time
    status: AppointmentStatus
    payment_method: str | None
    created_at: datetime | None
    staff: StaffRef
    service: ServiceRef
    customer: CustomerRef


class AdminAppointmentCreate(BaseModel):
    phone: str
    name: Name
    surname: Name
    staff_id: int
    service_id: int
    appointment_date: date
    appointment_time: time
    status: AppointmentStatus = AppointmentStatus.CONFIRMED

    _phone = field_validator("phone")(_check_phone)


class AdminAppointmentUpdate(BaseModel):
    status: AppointmentStatus | None = None
    payment_method: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None

    @model_validator(mode="after")
    def _status_not_null(self):
        if "status" in self.model_fields_set and self.status is None:
            raise ValueError("Durum boş olamaz")
        return self


class DashboardOut(BaseModel):
    date: date
    appointments_today: int
    completed_today: int
    cancelled_today: int
    pending_today: int
    expected_revenue_today: int
    appointments_this_week: int
    total_customers: int
    upcoming: list[AdminAppointmentOut]


# ---------- services ----------
class AdminServiceOut(_Orm):
    id: int
    name: str
    price: int
    duration_min: int
    is_active: bool
    staff_ids: list[int] = []


class ServiceCreate(BaseModel):
    name: Name
    price: int = Field(ge=0, le=10_000_000)
    duration_min: int = Field(ge=5, le=480)
    is_active: bool = True
    # Verilmezse hizmeti tüm personel verir.
    staff_ids: IdList | None = None


class ServiceUpdate(BaseModel):
    name: Name | None = None
    price: int | None = Field(default=None, ge=0, le=10_000_000)
    duration_min: int | None = Field(default=None, ge=5, le=480)
    is_active: bool | None = None
    staff_ids: IdList | None = None

    @model_validator(mode="after")
    def _no_nulls(self):
        for f in self.model_fields_set:
            if getattr(self, f) is None:
                raise ValueError(f"{f} boş olamaz")
        return self


# ---------- staff ----------
class StaffAdminOut(_Orm):
    id: int
    name: str
    surname: str
    phone: str
    role: RoleType | None
    created_at: datetime | None
    photo_image: str | None = None
    service_ids: list[int] = []


class StaffCreate(BaseModel):
    name: Name
    surname: Name
    phone: str
    password: str = Field(min_length=6, max_length=128)
    role: RoleType = RoleType.STAFF
    photo_image: str | None = None
    # Verilmezse personel tüm hizmetleri verir.
    service_ids: IdList | None = None

    _phone = field_validator("phone")(_check_phone)
    _photo = field_validator("photo_image")(_check_photo)


class StaffUpdate(BaseModel):
    name: Name | None = None
    surname: Name | None = None
    phone: str | None = None
    password: str | None = Field(default=None, min_length=6, max_length=128)
    role: RoleType | None = None
    # "" ya da null gönderilirse fotoğraf kaldırılır.
    photo_image: str | None = None
    service_ids: IdList | None = None

    _photo = field_validator("photo_image")(_check_photo)

    @field_validator("phone")
    @classmethod
    def _phone(cls, v):
        return None if v is None else _check_phone(v)

    @model_validator(mode="after")
    def _no_nulls(self):
        for f in self.model_fields_set - {"photo_image"}:
            if getattr(self, f) is None:
                raise ValueError(f"{f} boş olamaz")
        return self


# ---------- working hours / time off ----------
class WorkingHourIn(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    start_time: time
    end_time: time

    @model_validator(mode="after")
    def _order(self):
        if self.start_time >= self.end_time:
            raise ValueError("Başlangıç saati bitiş saatinden önce olmalı")
        return self


class WorkingHourOut(_Orm):
    staff_id: int
    day_of_week: int
    start_time: time
    end_time: time


class TimeOffCreate(BaseModel):
    staff_id: int
    start_date: date
    end_date: date
    reason: Annotated[str, StringConstraints(strip_whitespace=True, max_length=255)] | None = None

    @model_validator(mode="after")
    def _order(self):
        if self.start_date > self.end_date:
            raise ValueError("Başlangıç tarihi bitiş tarihinden sonra olamaz")
        return self


class TimeOffOut(_Orm):
    id: int
    staff_id: int
    start_date: date
    end_date: date
    reason: str | None


# ---------- payment methods ----------
class PaymentMethodOut(_Orm):
    id: int
    name: str
    details: dict | None
    is_active: bool


class PaymentMethodCreate(BaseModel):
    name: Name
    details: dict | None = None
    is_active: bool = True


class PaymentMethodUpdate(BaseModel):
    name: Name | None = None
    details: dict | None = None  # açıkça null gönderilirse temizlenir
    is_active: bool | None = None

    @model_validator(mode="after")
    def _no_nulls(self):
        for f in ("name", "is_active"):
            if f in self.model_fields_set and getattr(self, f) is None:
                raise ValueError(f"{f} boş olamaz")
        return self


# ---------- settings ----------
class SettingsBody(BaseModel):
    business_name: Name
    business_address: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None = None
    logo_image: str | None = None
    banner_image: str | None = None
    notification_banner_enabled: bool = False

    _images = field_validator("logo_image", "banner_image")(_check_image)


# ---------- customers ----------
class CustomerAdminOut(BaseModel):
    id: int
    name: str
    surname: str
    phone: str
    created_at: datetime | None
    appointment_count: int
    last_appointment_date: date | None
