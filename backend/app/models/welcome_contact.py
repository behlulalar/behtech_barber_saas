from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class WelcomeContact(Base):
    """Karşılama mesajı gönderilen kişi (24 saatte bir). Telefon tutulmaz: tenant+kimlik karması."""
    __tablename__ = "welcome_contacts"

    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True)
    contact_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    last_sent_at: Mapped[datetime] = mapped_column(DateTime)
