from datetime import datetime

from pydantic import BaseModel, ConfigDict


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
