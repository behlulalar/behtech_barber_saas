from datetime import datetime
from pydantic import BaseModel, ConfigDict


class StaffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    name: str
    surname: str
    phone: str
    created_at: datetime | None
