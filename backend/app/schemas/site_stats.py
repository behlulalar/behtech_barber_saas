from datetime import date
from typing import Literal

from pydantic import BaseModel


class SiteHitIn(BaseModel):
    event: Literal["view", "trial_click", "demo_click"]


class SiteStatDay(BaseModel):
    day: date
    view: int = 0
    trial_click: int = 0
    demo_click: int = 0


class SiteStatsOut(BaseModel):
    days: list[SiteStatDay]  # eskiden yeniye, boş günler dahil
    view: int
    trial_click: int
    demo_click: int
    signups: int  # aynı dönemde kendi kayıt olan işletme sayısı
