from datetime import date

from sqlalchemy import Date, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SiteStat(Base):
    """Tanıtım sitesi sayaçları: günlük toplam (ziyaret, "Ücretsiz dene" ve demo tıklaması). Çerez/IP/kişi verisi YOK, yalnızca sayı."""
    __tablename__ = "site_stats"

    day: Mapped[date] = mapped_column(Date, primary_key=True)
    event: Mapped[str] = mapped_column(String(20), primary_key=True)  # view | trial_click | demo_click
    count: Mapped[int] = mapped_column(Integer, server_default="0")
