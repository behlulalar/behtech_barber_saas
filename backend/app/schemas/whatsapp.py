from datetime import datetime

from pydantic import BaseModel

from app.schemas.otp import Phone


class WhatsappStatusOut(BaseModel):
    state: str  # open | connecting | close
    phone: str | None = None  # bağlı numara (90...)
    profile_name: str | None = None
    connected_at: datetime | None = None
    server_reachable: bool  # Evolution sunucusuna (platform altyapısı) ulaşılabildi mi
    paused: bool = False  # true: bu dükkândan hiç mesaj gitmez (platform ya da otomatik koruma durdurdu)
    paused_reason: str | None = None
    # Sahip kesmeden kopma: 'logged_out' | 'forbidden' (ban şüphesi) | 'connection_lost' | 'health_check' | Evolution kodu
    disconnect_reason: str | None = None
    disconnected_at: datetime | None = None
    welcome_enabled: bool = True  # karşılama mesajı açık mı


class WhatsappSettingsIn(BaseModel):
    welcome_enabled: bool


class WhatsappConnectIn(BaseModel):
    # Verilirse eşleştirme kodu da üretilir (panel telefonda açıkken QR okutulamaz: "Telefon numarasıyla bağla").
    phone: Phone | None = None


class WhatsappConnectOut(WhatsappStatusOut):
    qr_base64: str | None = None  # data:image/png;base64,...
    pairing_code: str | None = None  # WhatsApp > Bağlı cihazlar > Telefon numarasıyla bağla


class WhatsappTestIn(BaseModel):
    phone: Phone


class PlatformWhatsappOut(WhatsappStatusOut):
    """Platform panelinde dükkânın WhatsApp hattı: durum + koruma göstergeleri."""
    instance_name: str | None = None
    consecutive_failures: int = 0
    sent_24h: int = 0
    failed_24h: int = 0
    queue_pending: int = 0
    unverified_last_hour: int = 0  # gönderilip girilmeyen müşteri kodu (kötüye kullanım sinyali)
    breaker_threshold: int = 0
    abuse_alerted_at: datetime | None = None


class WhatsappPauseIn(BaseModel):
    paused: bool
    reason: str | None = None
