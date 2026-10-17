from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, false, func, text, true
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class WhatsappConnection(Base):
    """Dükkânın KENDİ WhatsApp hesabı (Evolution instance'ı). Dükkânın tüm doğrulama/şifre mesajları buradan gider.
    state: Evolution bağlantı durumu — 'open' (bağlı) | 'connecting' (QR/kod bekliyor) | 'close' (bağlı değil)."""
    __tablename__ = "whatsapp_connections"

    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True)
    instance_name: Mapped[str] = mapped_column(String(60), unique=True)
    state: Mapped[str] = mapped_column(String(20), server_default="close")
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)  # bağlı numara (90...)
    profile_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    connected_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # --- Ban / kötüye kullanım koruması ---
    # Platformun ya da sistemin durdurması: true iken bu dükkândan HİÇ mesaj gitmez.
    paused: Mapped[bool] = mapped_column(Boolean, server_default=false())
    paused_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    paused_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Arka arkaya başarısız gönderim; eşiği aşınca gönderim otomatik durur (hat sorunluysa zorlamayalım).
    consecutive_failures: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    # Aynı numaradan mesajlar arası boşluk (kuyruk bunu kilitli satır üzerinden uygular).
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Bağlıyken kopma: neden (Evolution statusReason / 'health_check') ve zaman. Panelde uyarı şeridi bunu kullanır.
    disconnect_reason: Mapped[str | None] = mapped_column(String(60), nullable=True)
    disconnected_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # İşletmenin ayarı: numarasına ilk kez yazana otomatik karşılama + randevu bağlantısı gitsin mi ("iptal" yanıtı bundan etkilenmez).
    welcome_enabled: Mapped[bool] = mapped_column(Boolean, server_default=true())
    # Kötüye kullanım alarmı (çok sayıda doğrulanmayan kod) en son ne zaman tetiklendi (bildirim tekrarını önler).
    abuse_alerted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
