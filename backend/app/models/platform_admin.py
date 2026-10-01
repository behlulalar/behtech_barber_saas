from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column
from sqlalchemy import  func, DateTime, String
from app.core.database import Base
from datetime import datetime

class PlatformAdmin(Base):
    __tablename__ = "platform_admins"

    id: Mapped[int] = mapped_column(primary_key=True)
    phone: Mapped[str] = mapped_column(String(10), unique=True)
    password: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())


