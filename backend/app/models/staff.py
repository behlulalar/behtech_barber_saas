from sqlalchemy import DateTime, String, func , ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column
from app.core.database import Base
from datetime import datetime
from sqlalchemy import Enum as SAEnum
from enum import Enum


class RoleType(str, Enum):
    SUPER_ADMIN = "super_admin"
    STAFF = "staff"
    TECHNICAL_SUPPORT = "technical_support"




class Staff(Base):
    __tablename__ = "staff"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255))
    surname: Mapped[str] = mapped_column(String(255))
    phone: Mapped[str] = mapped_column(String(10))
    password: Mapped[str] = mapped_column(String(255))
    role: Mapped[RoleType | None ] = mapped_column(
        SAEnum(RoleType, name="role_type", values_callable=lambda enum_class: [member.value for member in enum_class]),
        default=RoleType.STAFF,
    )
    created_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("phone", "tenant_id"),
        Index("idx_staff_tenant_id", "tenant_id"),
    )
