"""Personel/yönetici paneli (admin.py) için istek ve yanıt şemaları."""
import re
from datetime import date, datetime, time
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

from app.core.text import person_name_tr, title_case_tr
from app.models.appointment import AppointmentStatus
from app.models.staff import RoleType

_PHONE_RE = re.compile(r"^5\d{9}$")

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
# Kişi adı/soyadı da kaydedilmeden önce "Ali Yılmaz" biçimine getirilir.
PersonName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255), AfterValidator(person_name_tr)
]
# Hizmet adları kaydedilmeden önce "Saç Kesimi" biçimine getirilir (bkz. app/core/text.py).
ServiceName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255), AfterValidator(title_case_tr)
]


def _check_phone(value: str) -> str:
    value = value.strip()
    if not _PHONE_RE.match(value):
        raise ValueError("Telefon numarası 5 ile başlayan 10 haneli olmalı (örn. 5551234567)")
    return value


def _norm_contact_phone(value: str | None) -> str | None:
    """Müşteri sitesinde gösterilecek numara: cep (5xx) ya da sabit hat (2xx/3xx/4xx), 10 hane.
    "0555 123 45 67", "+90 555 123 45 67" gibi girdiler normalize edilir; boş → None."""
    if value is None or not value.strip():
        return None
    digits = re.sub(r"\D", "", value)
    if digits.startswith("90") and len(digits) > 10:
        digits = digits[2:]
    if digits.startswith("0"):
        digits = digits[1:]
    if not re.fullmatch(r"[2-5]\d{9}", digits):
        raise ValueError("Telefon numarası 10 haneli olmalı (örn. 5551234567 ya da 2125551234)")
    return digits


_IG_PREFIX = re.compile(r"^(?:https?://)?(?:www\.)?instagram\.com/", re.IGNORECASE)


def _norm_instagram(value: str | None) -> str | None:
    """"@berberali", "berberali" ya da profil bağlantısı → "berberali" (yalnızca kullanıcı adı saklanır)."""
    if value is None or not value.strip():
        return None
    v = _IG_PREFIX.sub("", value.strip()).split("?")[0].split("#")[0].strip("/ ").lstrip("@")
    if not re.fullmatch(r"[A-Za-z0-9._]{1,30}", v):
        raise ValueError("Instagram kullanıcı adı geçersiz (yalnızca harf, rakam, nokta ve alt çizgi; en fazla 30 karakter)")
    return v.lower()


# ~1.5 MB'lık görsel base64 ile ~2.1M karakter eder.
_IMG_MAX_CHARS = 2_100_000
_IMG_RE = re.compile(r"^data:image/(png|jpe?g|webp|gif);base64,")


def _check_image(value: str | None) -> str | None:
    if value is None or value == "":
        return None
    if re.fullmatch(r"/api/media/[0-9a-f]{32}\.(png|jpg|webp|gif)", value):
        return value  # daha önce yüklenmiş görsel (dosya varlığı kaydederken kontrol edilir)
    if not _IMG_RE.match(value):
        raise ValueError("Görsel geçerli bir resim dosyası olmalı (PNG, JPEG, WebP, GIF)")
    if len(value) > _IMG_MAX_CHARS:
        raise ValueError("Görsel çok büyük, en fazla 1,5 MB olabilir")
    return value


# Hizmet görseli müşteri sitesinde TÜM hizmet listesiyle birlikte indirilir: sıkı sınır (tarayıcı ~900px JPEG'e küçültür, ~100-200 KB).
_SERVICE_IMG_MAX_CHARS = 400_000


def _check_service_image(value: str | None) -> str | None:
    value = _check_image(value)
    if value is not None and value.startswith("data:") and len(value) > _SERVICE_IMG_MAX_CHARS:
        raise ValueError("Hizmet görseli çok büyük (en fazla ~300 KB); daha küçük bir görsel seçin")
    return value


# Personel fotoğrafı kartta büyük gösterildiği için (Retina'da ~1100x1350px) ayarlar
# görselleriyle aynı sınırı kullanır; tarayıcı 1400px'e küçültüp gönderir.
_check_photo = _check_image


IdList = Annotated[list[int], Field(max_length=500)]


def _no_pending(value):
    if value == AppointmentStatus.PENDING:
        raise ValueError("Randevular onay beklemez; 'beklemede' durumu artık kullanılmıyor")
    return value


class _Orm(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- auth ----------
class StaffMe(_Orm):
    id: int
    name: str
    surname: str
    phone: str
    role: RoleType | None
    # Destek modu: platform yöneticisi bu hesapla girdiyse dolu (token'dan gelir, DB alanı değil).
    impersonated_by: "ImpersonatedBy | None" = None
    read_only: bool = False


class ImpersonatedBy(BaseModel):
    id: int
    name: str | None = None
    phone: str


StaffMe.model_rebuild()


# ---------- nested refs ----------
class StaffRef(_Orm):
    id: int
    name: str
    surname: str


class ServiceRef(_Orm):
    id: int
    name: str
    price: int
    duration_min: int


class CustomerRef(_Orm):
    id: int
    name: str
    surname: str
    phone: str


# ---------- appointments ----------
class AdminAppointmentOut(BaseModel):
    id: int
    appointment_date: date
    appointment_time: time
    status: AppointmentStatus
    payment_method: str | None
    created_at: datetime | None
    staff: StaffRef
    service: ServiceRef
    customer: CustomerRef


class AdminAppointmentCreate(BaseModel):
    phone: str
    name: PersonName
    surname: PersonName
    staff_id: int
    service_id: int
    appointment_date: date
    appointment_time: time
    status: AppointmentStatus = AppointmentStatus.CONFIRMED

    _phone = field_validator("phone")(_check_phone)
    _status = field_validator("status")(_no_pending)


class AdminAppointmentUpdate(BaseModel):
    status: AppointmentStatus | None = None
    payment_method: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None

    _status = field_validator("status")(_no_pending)

    @model_validator(mode="after")
    def _status_not_null(self):
        if "status" in self.model_fields_set and self.status is None:
            raise ValueError("Durum boş olamaz")
        return self


class DashboardOut(BaseModel):
    date: date
    appointments_today: int
    completed_today: int
    cancelled_today: int
    expected_revenue_today: int | None = None  # yalnızca yöneticiye; personelde null
    appointments_this_week: int
    total_customers: int
    upcoming: list[AdminAppointmentOut]


# ---------- services ----------
class AdminServiceOut(_Orm):
    id: int
    name: str
    price: int
    duration_min: int
    is_active: bool
    image: str | None = None
    staff_ids: list[int] = []


def _duration_multiple_of_30(value: int) -> int:
    if value < 30 or value > 480 or value % 30 != 0:
        raise ValueError("Süre 30 dakikanın katı olmalı (30, 60, 90…)")
    return value


DurationMin = Annotated[int, AfterValidator(_duration_multiple_of_30)]


class ServiceCreate(BaseModel):
    name: ServiceName
    price: int = Field(ge=0, le=10_000_000)
    duration_min: DurationMin
    is_active: bool = True
    image: str | None = None
    # Verilmezse hizmeti tüm personel verir.
    staff_ids: IdList | None = None

    _image = field_validator("image")(_check_service_image)


class ServiceUpdate(BaseModel):
    name: ServiceName | None = None
    price: int | None = Field(default=None, ge=0, le=10_000_000)
    duration_min: DurationMin | None = None
    is_active: bool | None = None
    # "" ya da null gönderilirse görsel kaldırılır.
    image: str | None = None
    staff_ids: IdList | None = None

    _image = field_validator("image")(_check_service_image)

    @model_validator(mode="after")
    def _no_nulls(self):
        for f in self.model_fields_set - {"image"}:
            if getattr(self, f) is None:
                raise ValueError(f"{f} boş olamaz")
        return self


# ---------- staff ----------
class StaffAdminOut(_Orm):
    id: int
    name: str
    surname: str
    phone: str
    role: RoleType | None
    created_at: datetime | None
    photo_image: str | None = None
    service_ids: list[int] = []
    is_active: bool = True
    left_at: date | None = None


class StaffCreate(BaseModel):
    name: PersonName
    surname: PersonName
    phone: str
    password: str = Field(min_length=6, max_length=128)
    role: RoleType = RoleType.STAFF
    photo_image: str | None = None
    # Verilmezse personel tüm hizmetleri verir.
    service_ids: IdList | None = None

    _phone = field_validator("phone")(_check_phone)
    _photo = field_validator("photo_image")(_check_photo)


class StaffUpdate(BaseModel):
    name: PersonName | None = None
    surname: PersonName | None = None
    phone: str | None = None
    password: str | None = Field(default=None, min_length=6, max_length=128)
    role: RoleType | None = None
    # false = "İşten ayrıldı" (giriş kapanır, geçmiş korunur); true = tekrar aktif.
    is_active: bool | None = None
    # "" ya da null gönderilirse fotoğraf kaldırılır.
    photo_image: str | None = None
    service_ids: IdList | None = None

    _photo = field_validator("photo_image")(_check_photo)

    @field_validator("phone")
    @classmethod
    def _phone(cls, v):
        return None if v is None else _check_phone(v)

    @model_validator(mode="after")
    def _no_nulls(self):
        for f in self.model_fields_set - {"photo_image"}:
            if getattr(self, f) is None:
                raise ValueError(f"{f} boş olamaz")
        return self


# ---------- working hours / time off ----------
class WorkingHourIn(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    start_time: time
    end_time: time

    @model_validator(mode="after")
    def _order(self):
        if self.start_time >= self.end_time:
            raise ValueError("Başlangıç saati bitiş saatinden önce olmalı")
        return self


class WorkingHourOut(_Orm):
    staff_id: int
    day_of_week: int
    start_time: time
    end_time: time


def _on_grid(t: time) -> bool:
    return t.minute in (0, 30) and t.second == 0 and t.microsecond == 0


class TimeOffCreate(BaseModel):
    staff_id: int
    start_date: date
    end_date: date
    # İsteğe bağlı saat aralığı: ikisi birden verilir ya da hiçbiri (tüm gün). Aralık, tarih aralığındaki HER gün için geçerlidir.
    # end_time 00:00 = gün sonu. Saatler :00 / :30 olmalı (randevular 30 dk ızgarasında).
    start_time: time | None = None
    end_time: time | None = None
    reason: Annotated[str, StringConstraints(strip_whitespace=True, max_length=255)] | None = None

    @model_validator(mode="after")
    def _order(self):
        if self.start_date > self.end_date:
            raise ValueError("Başlangıç tarihi bitiş tarihinden sonra olamaz")
        if (self.start_time is None) != (self.end_time is None):
            raise ValueError("Saat aralığı için başlangıç ve bitiş saati birlikte girilmeli (ya da ikisi de boş: tüm gün)")
        if self.start_time is not None and self.end_time is not None:
            if not (_on_grid(self.start_time) and _on_grid(self.end_time)):
                raise ValueError("Saatler yalnızca :00 ya da :30 olabilir")
            if self.end_time != time(0, 0) and self.end_time <= self.start_time:
                raise ValueError("Bitiş saati başlangıç saatinden sonra olmalı")
            if self.end_time == time(0, 0) and self.start_time == time(0, 0):
                raise ValueError("Saat aralığı boş olamaz (tüm gün için saatleri boş bırakın)")
        return self


class TimeOffOut(_Orm):
    id: int
    staff_id: int
    start_date: date
    end_date: date
    start_time: time | None = None
    end_time: time | None = None
    reason: str | None
    # Yalnızca oluşturma yanıtında: bu izinle çakışan MEVCUT onaylı randevu sayısı (iptal edilmez, yalnızca uyarı).
    conflicting_appointments: int = 0


# ---------- payment methods ----------
class PaymentMethodOut(_Orm):
    id: int
    name: str
    details: dict | None
    is_active: bool


class PaymentMethodCreate(BaseModel):
    name: Name
    details: dict | None = None
    is_active: bool = True


class PaymentMethodUpdate(BaseModel):
    name: Name | None = None
    details: dict | None = None  # açıkça null gönderilirse temizlenir
    is_active: bool | None = None

    @model_validator(mode="after")
    def _no_nulls(self):
        for f in ("name", "is_active"):
            if f in self.model_fields_set and getattr(self, f) is None:
                raise ValueError(f"{f} boş olamaz")
        return self


# ---------- settings ----------
class SettingsBody(BaseModel):
    business_name: Name
    business_address: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None = None
    logo_image: str | None = None
    banner_image: str | None = None
    notification_banner_enabled: bool = False
    contact_phone: str | None = None
    whatsapp_phone: str | None = None
    instagram: str | None = None

    _images = field_validator("logo_image", "banner_image")(_check_image)
    _phones = field_validator("contact_phone", "whatsapp_phone")(_norm_contact_phone)
    _instagram = field_validator("instagram")(_norm_instagram)


# ---------- customers ----------
class CustomerAdminOut(BaseModel):
    id: int
    name: str
    surname: str
    phone: str
    created_at: datetime | None
    appointment_count: int
    last_appointment_date: date | None


# ---------- işletme kapalı günü ("Bugün kapalıyım") ----------
class ClosureIn(BaseModel):
    date: date


class ClosureOut(BaseModel):
    date: date
    closed: bool  # hizmet veren TÜM personel o gün tüm gün izinli
    confirmed_appointments: int  # o gün için mevcut onaylı randevu sayısı (iptal edilmez)


class SiteLinkOut(BaseModel):
    url: str  # müşteri sitesinin adresi (işletme alt alanı)
    qr: str  # baskıya uygun QR (SVG data URI)
