from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column
from sqlalchemy import String, func , ForeignKey, UniqueConstraint, Boolean, true
from app.core.database import Base

class Service(Base):
    __tablename__ = "services"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255))
    price: Mapped[int]
    duration_min: Mapped[int]
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=true())

    __table_args__ = (
        UniqueConstraint("name", "tenant_id"),
    )
    