from typing import Annotated

from pydantic import AfterValidator, BaseModel, Field, StringConstraints

from app.core.text import person_name_tr
from app.schemas.otp import Phone

PersonName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255), AfterValidator(person_name_tr)
]


class TenantCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    # Biçim/rezerve kontrolü servis katmanında yapılır (Türkçe 400 mesajı için).
    slug: str = Field(max_length=255)
    owner_name: PersonName
    owner_surname: PersonName
    owner_phone: Phone
    owner_password: str = Field(min_length=6, max_length=128)


class TenantUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    is_active: bool | None = None


class PlatformMe(BaseModel):
    id: int
    phone: str


class PlatformStats(BaseModel):
    tenant_count: int
    active_tenant_count: int
    total_appointments: int
    appointments_last_30_days: int
