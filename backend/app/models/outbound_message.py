from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class OutboundMessage(Base):
    """Giden mesaj kuyruğu (onay, iptal, hatırlatma, personel bildirimi). Doğrulama kodları KUYRUĞA GİRMEZ (anında gider).
    Kuyruk her dükkânın numarasından mesajları rastgele aralıklarla gönderir: hacim sınırı yok, mesaj düşmez, yalnızca sıraya girer.
    status: pending | sending | sent | failed | cancelled. Gönderildikten sonra telefon ve metin silinir (veri azaltma)."""
    __tablename__ = "outbound_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(30))
    to_phone: Mapped[str | None] = mapped_column(String(40), nullable=True)  # 905XXXXXXXXX ya da @lid kimliği
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(12), server_default="pending")
    attempts: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    not_before: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    error: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Bu süreden sonra gönderilmez (bayat onay/hatırlatma, bağlantı dönünce toplu yağmasın).
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # İlgili randevu: gönderimden önce hâlâ geçerli mi (iptal edildiyse onay/hatırlatma gitmez) kontrol edilir.
    appointment_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    __table_args__ = (
        Index("idx_outbound_pending", "status", "not_before"),
        Index("idx_outbound_tenant", "tenant_id", "created_at"),
    )
