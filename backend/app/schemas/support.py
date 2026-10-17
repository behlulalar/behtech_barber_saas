from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Category = Literal["whatsapp", "appointments", "payment", "other"]


class TicketIn(BaseModel):
    category: Category = "other"
    message: str = Field(min_length=5, max_length=2000)


class TicketOut(BaseModel):
    id: int
    category: Category
    message: str
    status: Literal["open", "closed"]
    reply: str | None = None
    created_at: datetime
    closed_at: datetime | None = None


class PlatformTicketOut(TicketOut):
    tenant_id: int
    tenant_name: str
    staff_name: str | None = None
    staff_phone: str | None = None


class TicketReplyIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
