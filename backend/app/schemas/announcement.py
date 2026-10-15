from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class AnnouncementIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=2000)
    level: Literal["info", "warning"] = "info"
    target_all: bool = True
    tenant_ids: list[int] = Field(default_factory=list, max_length=500)  # target_all=false ise en az bir işletme
    starts_on: date | None = None  # boşsa bugün
    ends_on: date | None = None  # boşsa süresiz

    @model_validator(mode="after")
    def _check(self):
        if not self.target_all and not self.tenant_ids:
            raise ValueError("Seçili işletmelere gönderim için en az bir işletme seçin")
        if self.starts_on and self.ends_on and self.ends_on < self.starts_on:
            raise ValueError("Bitiş tarihi başlangıçtan önce olamaz")
        return self


class AnnouncementUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    body: str | None = Field(default=None, min_length=1, max_length=2000)
    level: Literal["info", "warning"] | None = None
    target_all: bool | None = None
    tenant_ids: list[int] | None = Field(default=None, max_length=500)
    starts_on: date | None = None
    ends_on: date | None = None
    clear_ends_on: bool = False  # süresiz yap


class AnnouncementOut(BaseModel):
    id: int
    title: str
    body: str
    level: str
    target_all: bool
    tenant_ids: list[int]
    starts_on: date
    ends_on: date | None
    status: str  # scheduled | active | ended
    created_at: datetime | None = None


class AnnouncementPublic(BaseModel):
    """İşletme panelinde gösterilen duyuru."""
    id: int
    title: str
    body: str
    level: str
