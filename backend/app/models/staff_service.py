from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column
from sqlalchemy import DateTime, Date,  func, ForeignKey, String, UniqueConstraint, Index
from app.core.database import Base
from datetime import date, datetime

class StaffService(Base):
    __tablename__ = "staff_services"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    staff_id: Mapped[int] = mapped_column(ForeignKey("staff.id", ondelete="CASCADE"))
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id", ondelete="CASCADE"))
    price: Mapped[int | None]
    created_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("service_id", "staff_id"),
        Index("idx_staff_services_tenant_id", "tenant_id"),
    )
