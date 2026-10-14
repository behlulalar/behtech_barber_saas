from datetime import date, datetime

from pydantic import BaseModel, Field


class PlanOut(BaseModel):
    id: int
    name: str
    duration_months: int
    price: int
    is_active: bool
    sort_order: int


class PlanCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    duration_months: int = Field(ge=1, le=60)
    price: int = Field(ge=0)
    is_active: bool = True
    sort_order: int = 0


class PlanUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    duration_months: int | None = Field(default=None, ge=1, le=60)
    price: int | None = Field(default=None, ge=0)
    is_active: bool | None = None
    sort_order: int | None = None


class InitialPayment(BaseModel):
    amount: int = Field(gt=0)
    paid_on: date
    method: str = Field(default="IBAN", min_length=1, max_length=50)
    note: str | None = None


class SubscriptionCreate(BaseModel):
    plan_id: int | None = None
    plan_name: str | None = Field(default=None, max_length=100)
    start_date: date
    end_date: date | None = None
    price: int | None = Field(default=None, ge=0)
    note: str | None = None
    initial_payment: InitialPayment | None = None


class SubscriptionUpdate(BaseModel):
    plan_name: str | None = Field(default=None, min_length=1, max_length=100)
    start_date: date | None = None
    end_date: date | None = None
    price: int | None = Field(default=None, ge=0)
    note: str | None = None


class SubscriptionOut(BaseModel):
    id: int
    tenant_id: int
    plan_id: int | None
    plan_name: str
    start_date: date
    end_date: date
    price: int
    note: str | None
    paid_amount: int
    balance: int
    payment_status: str  # paid | partial | unpaid
    reminded_at: datetime | None
    created_at: datetime | None
    is_custom: bool


class SuggestOut(BaseModel):
    start_date: date
    end_date: date
    price: int


class PaymentOut(BaseModel):
    id: int
    tenant_id: int
    tenant_name: str
    subscription_id: int | None
    subscription_label: str | None
    amount: int
    paid_on: date
    method: str
    note: str | None
    created_at: datetime | None


class PaymentCreate(BaseModel):
    tenant_id: int
    subscription_id: int | None = None
    amount: int = Field(gt=0)
    paid_on: date
    method: str = Field(default="IBAN", min_length=1, max_length=50)
    note: str | None = None


class TenantBilling(BaseModel):
    tenant_id: int
    tenant_name: str
    slug: str
    is_active: bool
    auto_suspended_at: datetime | None
    owner_name: str | None
    owner_phone: str | None
    status: str  # untracked | scheduled | active | due_soon | grace | expired
    coverage_end: date | None
    days_left: int | None
    current: SubscriptionOut | None
    next: SubscriptionOut | None
    outstanding: int
    last_payment_on: date | None
    reminded_at: datetime | None
    # Yenileme: son dönemin paketi aktifse güncel liste fiyatı, değilse son dönemin anlaşılan fiyatı.
    renewal_plan_name: str | None = None
    renewal_price: int | None = None
    # Şu an istenmesi gereken tutar: ödenmemiş bakiye varsa o; yoksa yenileme zamanı geldiyse
    # (due_soon/grace/expired ve henüz yeni dönem açılmamışsa) yenileme tutarı; aksi halde 0.
    amount_due: int = 0


class BillingStats(BaseModel):
    revenue_this_month: int
    revenue_this_year: int
    revenue_last_30_days: int
    outstanding_total: int
    due_soon_count: int
    grace_count: int
    expired_count: int
    tracked_count: int
    untracked_count: int


class BillingOverview(BaseModel):
    stats: BillingStats
    attention: list[TenantBilling]
    recent_payments: list[PaymentOut]


class PlatformSettingsBase(BaseModel):
    iban: str | None = None
    account_holder: str | None = Field(default=None, max_length=255)
    bank_name: str | None = Field(default=None, max_length=255)
    reminder_days: int = Field(ge=1, le=30)
    grace_days: int = Field(ge=0, le=60)
    notify_email: str | None = Field(default=None, max_length=255)
    reminder_template: str = Field(min_length=1, max_length=2000)
    overdue_template: str = Field(min_length=1, max_length=2000)


class PlatformSettingsUpdate(PlatformSettingsBase):
    pass


class PlatformSettingsOut(PlatformSettingsBase):
    email_configured: bool
    push_configured: bool


class RunChecksResult(BaseModel):
    checked: int
    notified: int
    suspended: list[str]
    reactivated: list[str]
    email_sent: bool
    push_sent: int


class PushKeys(BaseModel):
    p256dh: str = Field(min_length=1, max_length=255)
    auth: str = Field(min_length=1, max_length=255)


class PushSubscribeIn(BaseModel):
    endpoint: str = Field(min_length=1)
    keys: PushKeys


class PushUnsubscribeIn(BaseModel):
    endpoint: str = Field(min_length=1)


class PushPublicKey(BaseModel):
    public_key: str | None


class PushTestResult(BaseModel):
    sent: int
