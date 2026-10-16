from datetime import date, datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, Field, StringConstraints

from app.core.text import person_name_tr
from app.schemas.otp import Phone

PersonName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255), AfterValidator(person_name_tr)
]


class TenantCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    # Biçim/rezerve kontrolü servis katmanında yapılır (Türkçe 400 mesajı için).
    slug: str = Field(max_length=255)
    owner_name: PersonName
    owner_surname: PersonName
    owner_phone: Phone
    owner_password: str = Field(min_length=6, max_length=128)
    start_trial: bool = False
    trial_days: int = Field(default=14, ge=1, le=60)


class TenantUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    is_active: bool | None = None
    note: str | None = Field(default=None, max_length=2000)


class OwnerUpdate(BaseModel):
    name: PersonName | None = None
    surname: PersonName | None = None
    phone: Phone | None = None


class OwnerPasswordReset(BaseModel):
    password: str | None = Field(default=None, min_length=6, max_length=128)


class OwnerPasswordOut(BaseModel):
    password: str


class PlatformMe(BaseModel):
    totp_enabled: bool = False
    mfa_setup_required: bool = False  # true: oturum yalnızca 2FA kurulumu için geçerli (kurulum bitmeden başka uç açılmaz)
    id: int
    phone: str
    name: str | None = None


class PlatformStats(BaseModel):
    tenant_count: int
    active_tenant_count: int
    total_appointments: int
    appointments_last_30_days: int


class PlatformAdminOut(BaseModel):
    totp_enabled: bool = False
    id: int
    phone: str
    name: str | None
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime | None
    is_me: bool


class PlatformAdminCreate(BaseModel):
    phone: Phone
    name: str | None = Field(default=None, max_length=100)
    # Politika (uzunluk, yaygın şifre...) serviste Türkçe mesajla denetlenir.
    password: str = Field(max_length=128)


class PlatformAdminUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    phone: Phone | None = None  # giriş telefonu; değişirse yöneticinin açık oturumları düşer (kendisininki hariç)
    is_active: bool | None = None


class PasswordResetIn(BaseModel):
    password: str = Field(max_length=128)


class PasswordChangeIn(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: str = Field(max_length=128)


class AuditActionOut(BaseModel):
    value: str
    label: str
    group: str


class AuditLogOut(BaseModel):
    id: int
    created_at: datetime
    actor_type: str
    actor_id: int | None
    actor_label: str
    action: str
    action_label: str
    entity_type: str | None
    entity_id: int | None
    tenant_id: int | None
    tenant_name: str | None
    summary: str
    details: dict | None
    ip: str | None


class AuditPage(BaseModel):
    items: list[AuditLogOut]
    total: int
    limit: int
    offset: int


class JobRunOut(BaseModel):
    id: int
    job: str
    trigger: str
    started_at: datetime
    finished_at: datetime | None
    duration_ms: int | None
    ok: bool
    result: dict | None
    error: str | None


class DbStatus(BaseModel):
    ok: bool
    size_mb: float


class BillingJobStatus(BaseModel):
    last_run: JobRunOut | None
    last_ok_at: datetime | None
    hours_since_last_ok: float | None
    overdue: bool


class BackupStatus(BaseModel):
    last_backup_at: datetime | None
    file: str | None
    size_mb: float | None
    age_hours: float | None
    ok: bool
    verified_at: datetime | None
    verified_ok: bool | None


class ChannelsStatus(BaseModel):
    email_configured: bool
    push_configured: bool
    push_subscribers: int
    whatsapp_configured: bool
    whatsapp_reachable: bool | None  # Evolution sunucusu (platform altyapısı) ayakta mı
    whatsapp_state: str | None = None  # ESKİ (tek hat); artık hep None. Dükkân bağlantıları: whatsapp_connected_tenants
    whatsapp_connected_tenants: int = 0  # kendi WhatsApp'ı bağlı dükkân sayısı


class WhatsappTenantUsage(BaseModel):
    tenant_id: int | None
    name: str
    sent: int
    failed: int


class WhatsappAlert(BaseModel):
    tenant_id: int
    name: str
    kind: str  # paused | disconnected
    reason: str | None = None
    since: datetime | None = None


class WhatsappStats(BaseModel):
    sent_24h: int
    failed_24h: int
    hourly_limit: int  # işletme başına saatlik doğrulama kodu tavanı (sistem mesajları sınırsız, kuyrukta)
    queue_pending: int = 0
    alerts: list[WhatsappAlert] = []  # durdurulan / kopan işletme hatları
    top_tenants: list[WhatsappTenantUsage]  # son 24 saatte en çok mesaj gönderen işletmeler


class CountsStatus(BaseModel):
    tenants: int
    active_tenants: int
    platform_admins: int
    audit_logs_last_24h: int
    failed_logins_last_24h: int


class SystemStatus(BaseModel):
    server_time: datetime
    db: DbStatus
    billing_job: BillingJobStatus
    backup: BackupStatus
    channels: ChannelsStatus
    whatsapp: WhatsappStats
    counts: CountsStatus


class ImpersonateIn(BaseModel):
    read_only: bool = False
    staff_id: int | None = None


class ImpersonateOut(BaseModel):
    code: str
    slug: str
    expires_in: int


# ---------- gelir / kullanım metrikleri (Genel Bakış) ----------
class PlanSlice(BaseModel):
    plan_name: str
    tenants: int
    mrr: int


class RenewalItem(BaseModel):
    tenant_id: int
    tenant_name: str
    slug: str
    end_date: date
    days_left: int
    amount_due: int
    is_trial: bool


class MonthRevenue(BaseModel):
    month: str  # YYYY-MM
    revenue: int


class ChurnItem(BaseModel):
    tenant_id: int
    tenant_name: str
    reason: str  # 'askıya alındı' | 'deneme bitti'


class AtRiskItem(BaseModel):
    tenant_id: int
    tenant_name: str
    slug: str
    last_appointment_date: date | None
    days_since: int
    appointments_30d: int
    appointments_prev_30d: int
    reason: str


class UsageItem(BaseModel):
    tenant_id: int
    tenant_name: str
    appointments_30d: int


class MetricsOverview(BaseModel):
    mrr: int
    arr: int
    paying_tenants: int
    trial_tenants: int
    month_collected: int
    plan_distribution: list[PlanSlice]
    renewals_next_30: list[RenewalItem]
    monthly_revenue: list[MonthRevenue]
    churned_last_30: list[ChurnItem]
    at_risk: list[AtRiskItem]
    top_usage: list[UsageItem]


class PlatformLoginOut(BaseModel):
    """Giriş sonucu: ya doğrudan oturum, ya da ikinci adım (mfa_required + mfa_token), ya da kısıtlı kurulum oturumu."""
    access_token: str | None = None
    token_type: str = "bearer"
    mfa_required: bool = False
    mfa_token: str | None = None  # 5 dk geçerli; /platform/login/mfa ile kullanılır
    mfa_setup_required: bool = False  # access_token yalnızca 2FA kurulumuna izin verir


class MfaLoginIn(BaseModel):
    mfa_token: str = Field(max_length=1000)
    code: str = Field(max_length=32)  # 6 haneli kod ya da yedek kod


class TwoFactorStatus(BaseModel):
    enabled: bool
    required: bool
    backup_codes_remaining: int


class TwoFactorSetupIn(BaseModel):
    password: str = Field(max_length=128)


class TwoFactorSetupOut(BaseModel):
    secret: str  # elle girmek için
    otpauth_uri: str
    qr: str  # data:image/svg+xml;base64,...


class TwoFactorConfirmIn(BaseModel):
    code: str = Field(max_length=32)


class TwoFactorConfirmOut(BaseModel):
    backup_codes: list[str]  # yalnızca BİR KEZ gösterilir
    access_token: str  # kurulum oturumu yerine tam yetkili oturum


class TwoFactorGuardedIn(BaseModel):
    password: str = Field(max_length=128)
    code: str = Field(max_length=32)


class BackupCodesOut(BaseModel):
    backup_codes: list[str]
