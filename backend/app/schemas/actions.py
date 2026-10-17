from typing import Literal

from pydantic import BaseModel


class ActionItem(BaseModel):
    key: str
    severity: Literal["high", "medium", "low"]
    category: Literal["signup", "billing", "whatsapp", "notification"]
    title: str
    detail: str | None = None
    tenant_id: int | None = None
    tenant_name: str | None = None
    link: str  # platform içi yol


class ActionQueueOut(BaseModel):
    total: int
    high: int
    items: list[ActionItem]
