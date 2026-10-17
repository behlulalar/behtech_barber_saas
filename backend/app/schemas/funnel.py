from pydantic import BaseModel


class FunnelStep(BaseModel):
    key: str
    label: str
    count: int
    pct_of_first: int | None = None  # ilk adıma göre yüzde
    pct_of_prev: int | None = None  # bir önceki adıma göre yüzde


class FunnelOut(BaseModel):
    """Kendi kayıt olan işletmelerin yolculuğu (tüm zamanlar): kayıt -> onay -> kurulum -> ilk randevu -> ilk ödeme."""
    steps: list[FunnelStep]
