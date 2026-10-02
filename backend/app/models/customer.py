from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column
from sqlalchemy import DateTime, String, func , ForeignKey, UniqueConstraint, Index
from app.core.database import Base
from datetime import datetime

class Customers(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255))
    surname: Mapped[str] = mapped_column(String(255))
    phone: Mapped[str] = mapped_column(String(10))
    created_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("phone", "tenant_id"),
        Index("idx_customers_tenant_id", "tenant_id"),
    )
