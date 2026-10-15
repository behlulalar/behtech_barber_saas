from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ConsentRecord(Base):
    """KVKK/şart onay kaydı: kim, hangi metnin hangi sürümünü, ne zaman onayladı.
    kind: 'customer_privacy' (müşteri aydınlatma metni) | 'tenant_terms' (işletme kullanım şartları + veri işleme sözleşmesi)."""
    __tablename__ = "consent_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(30))
    version: Mapped[str] = mapped_column(String(20))
    tenant_id: Mapped[int | None] = mapped_column(ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True)
    phone: Mapped[str] = mapped_column(String(10))
    ip: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("idx_consent_lookup", "kind", "tenant_id", "phone", "version"),
    )
