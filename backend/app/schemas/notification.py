from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class InboxItem(BaseModel):
    key: str  # "a:<duyuru id>" ya da "n:<bildirim id>"
    source: Literal["announcement", "notification"]
    kind: str  # announcement | message | whatsapp
    level: str  # info | warning | critical
    title: str
    body: str
    link: str | None = None
    created_at: datetime | None = None
    read: bool


class InboxOut(BaseModel):
    unread: int
    items: list[InboxItem]


class InboxRead(BaseModel):
    keys: list[str] = Field(min_length=1, max_length=100)


class NotificationIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=2000)
    level: Literal["info", "warning", "critical"] = "info"


class NotificationOut(BaseModel):
    id: int
    kind: str
    level: str
    title: str
    body: str
    created_at: datetime | None = None
    read_at: datetime | None = None
