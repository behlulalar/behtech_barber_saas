from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SetupCheck(BaseModel):
    key: str
    label: str
    ok: bool
    hint: str


class SetupOut(BaseModel):
    ready: bool
    missing_count: int
    checks: list[SetupCheck]


class OwnerOut(BaseModel):
    id: int
    name: str
    surname: str
    phone: str


class TenantOut(BaseModel):
    """Platform panelinde görünen dükkân özeti."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    is_active: bool
    created_at: datetime | None = None
    staff_count: int = 0
    appointment_count: int = 0
    owner_name: str | None = None
    owner_phone: str | None = None
    auto_suspended: bool = False
    note: str | None = None
    signup_status: str | None = None
    setup: SetupOut | None = None


class TenantDetailOut(TenantOut):
    owner: OwnerOut | None = None


class TenantPage(BaseModel):
    items: list[TenantOut]
    total: int
    limit: int
    offset: int


class TenantOption(BaseModel):
    id: int
    name: str
    slug: str
