from datetime import datetime

from pydantic import BaseModel

from app.schemas.otp import Phone


class WhatsappStatusOut(BaseModel):
    state: str  # open | connecting | close
    phone: str | None = None  # bağlı numara (90...)
    profile_name: str | None = None
    connected_at: datetime | None = None
    server_reachable: bool  # Evolution sunucusuna (platform altyapısı) ulaşılabildi mi


class WhatsappConnectIn(BaseModel):
    # Verilirse eşleştirme kodu da üretilir (panel telefonda açıkken QR okutulamaz: "Telefon numarasıyla bağla").
    phone: Phone | None = None


class WhatsappConnectOut(WhatsappStatusOut):
    qr_base64: str | None = None  # data:image/png;base64,...
    pairing_code: str | None = None  # WhatsApp > Bağlı cihazlar > Telefon numarasıyla bağla


class WhatsappTestIn(BaseModel):
    phone: Phone
