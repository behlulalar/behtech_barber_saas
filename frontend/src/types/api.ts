// API sözleşmesinin (API_CONTRACT.md) tüm istek/yanıt tipleri.
// Tarih: 'YYYY-MM-DD'. Saat: yanıtlarda 'HH:MM:SS', isteklerde 'HH:MM' veya 'HH:MM:SS'.
// Para: tam sayı TL. Telefon: 10 hane, başında 0 yok (5551234567).

// Randevular doğrudan 'confirmed' olarak oluşur (onay adımı yok)
export type AppointmentStatus = 'confirmed' | 'completed' | 'cancelled' | 'no_show'
export type StaffRole = 'super_admin' | 'technical_support' | 'staff'

/* ---------- Ortak ---------- */

export interface ServiceBrief {
  id: number
  name: string
  price: number
  duration_min: number
}

export interface StaffBrief {
  id: number
  name: string
  surname: string
}

export interface MessageResponse {
  message: string
}

/* ---------- Public ---------- */

export interface HealthResponse {
  status: string
}

export interface PublicTenant {
  name: string
  slug: string
  business_name: string
  business_address: string | null
  logo_image: string | null
  banner_image: string | null
  contact_phone: string | null
  whatsapp_phone: string | null
  instagram: string | null
  /** false: işletmenin WhatsApp'ı bağlı değil, müşteri online kod alamaz. */
  otp_available: boolean
}

export interface PublicStaff extends StaffBrief {
  photo_image: string | null
  /** Bu berberin verdiği hizmetlerin id'leri; hizmet seçilince berber listesi buna göre süzülür. */
  service_ids: number[]
}
export interface PublicService extends ServiceBrief {
  /** İsteğe bağlı fotoğraf (data URL). */
  image?: string | null
}

export interface AvailabilityParams {
  /** Boş = "fark etmez" (hizmeti veren tüm berberlerin birleşik saatleri). */
  staff_id?: number
  service_id: number
  date: string
}

export type SlotStatus = 'free' | 'busy' | 'past' | 'off'

export interface Slot {
  /** "HH:MM" */
  start: string
  end: string
  status: SlotStatus
  /** Bu slot başlangıç olarak seçilebilir mi (kendisi + sonraki n-1 slot boş). */
  bookable: boolean
}

export interface SlotsResponse {
  date: string
  slot_minutes: number
  /** Seçilen hizmetin kapladığı slot sayısı. */
  duration_slots: number
  closed_reason: 'day_off' | 'time_off' | null
  slots: Slot[]
}

export interface SendCodeRequest {
  phone: string
  /** Aydınlatma metni onayı (KVKK). */
  kvkk_accepted: boolean
}

export interface SendCodeResponse {
  message: string
  dev_code: string | null
}

export interface VerifyCodeRequest {
  phone: string
  code: string
}

export interface CustomerName {
  name: string
  surname: string
}

export interface VerifyCodeResponse {
  access_token: string
  token_type: string
  customer: CustomerName | null
}

export interface CreateAppointmentRequest {
  name: string
  surname: string
  /** Boş = "fark etmez": sunucu o saati alabilen berberler arasından seçer. */
  staff_id?: number
  service_id: number
  appointment_date: string
  appointment_time: string
}

export interface AppointmentPublicOut {
  id: number
  appointment_date: string
  appointment_time: string
  status: AppointmentStatus
  service: ServiceBrief
  staff: StaffBrief
}

/* ---------- Auth (staff) ---------- */

export interface LoginRequest {
  phone: string
  password: string
  remember?: boolean
}

export interface TokenResponse {
  access_token: string
  token_type: string
}

export interface StaffMe {
  id: number
  name: string
  surname: string
  phone: string
  role: StaffRole
  /** Destek modu: platform yöneticisi bu hesapla girdiyse dolu. */
  impersonated_by?: { id: number; name: string | null; phone: string } | null
  read_only?: boolean
}

/* ---------- Admin ---------- */

export interface AdminAppointmentOut {
  id: number
  appointment_date: string
  appointment_time: string
  status: AppointmentStatus
  payment_method: string | null
  created_at: string
  staff: StaffBrief
  service: ServiceBrief
  customer: { id: number; name: string; surname: string; phone: string }
}

/* ---------- Gelir raporu ---------- */

export type ReportPeriod = 'day' | 'month' | 'year'

export interface RevenueSeriesPoint {
  /** day: saat (0-23), month: ayın günü (1-31), year: ay (1-12) */
  key: number
  revenue: number
  count: number
}

export interface ServiceRevenue {
  service_id: number
  name: string
  count: number
  revenue: number
  share_pct: number
}

export interface PaymentMethodRevenue {
  /** null = ödeme yöntemi belirtilmemiş */
  method: string | null
  count: number
  revenue: number
}

export interface StaffRevenue {
  staff_id: number
  name: string
  surname: string
  count: number
  revenue: number
  is_active?: boolean
}

export interface RevenueReport {
  period: ReportPeriod
  date_from: string
  date_to: string
  staff_id: number | null
  /** Yalnızca "tamamlandı" randevuların hizmet fiyatları toplamı. */
  revenue: number
  completed_count: number
  average_ticket: number
  cancelled_count: number
  no_show_count: number
  /** Henüz tamamlandı işaretlenmemiş (bekleyen/onaylı) randevular; gelire dahil değil. */
  open_count: number
  open_revenue: number
  previous: { revenue: number; completed_count: number }
  previous_date_from: string
  previous_date_to: string
  series: RevenueSeriesPoint[]
  by_service: ServiceRevenue[]
  by_payment_method: PaymentMethodRevenue[]
  /** Sadece yöneticilere dolu. */
  by_staff: StaffRevenue[]
}

export interface DashboardOut {
  date: string
  appointments_today: number
  completed_today: number
  cancelled_today: number
  /** Yalnızca yöneticiye; personelde null. */
  expected_revenue_today: number | null
  appointments_this_week: number
  total_customers: number
  upcoming: AdminAppointmentOut[]
}

export interface AdminAppointmentsParams {
  date_from?: string
  date_to?: string
  staff_id?: number
  status?: AppointmentStatus
}

export interface AdminAppointmentCreate {
  phone: string
  name: string
  surname: string
  staff_id: number
  service_id: number
  appointment_date: string
  appointment_time: string
  status?: AppointmentStatus
}

export interface AdminAppointmentUpdate {
  status?: AppointmentStatus
  payment_method?: string | null
}

export interface AdminService extends ServiceBrief {
  is_active: boolean
  image?: string | null
  /** Bu hizmeti veren personel. */
  staff_ids: number[]
}

export interface AdminServiceCreate {
  name: string
  price: number
  duration_min: number
  is_active?: boolean
  /** Fotoğraf (data URL); null/boş = kaldır. */
  image?: string | null
  /** Verilmezse backend tüm personeli (teknik destek hariç) atar. */
  staff_ids?: number[]
}

export type AdminServiceUpdate = Partial<AdminServiceCreate>

export interface AdminStaff {
  id: number
  name: string
  surname: string
  phone: string
  role: StaffRole
  created_at: string
  /** data:image/... URL'i (backend en fazla ~300 KB kabul eder). */
  photo_image: string | null
  /** Bu personelin verdiği hizmetler. */
  service_ids: number[]
  /** false = işten ayrıldı (giriş kapalı, geçmiş korunur). */
  is_active: boolean
  left_at: string | null
}

export interface AdminStaffCreate {
  name: string
  surname: string
  phone: string
  password: string
  role: StaffRole
  photo_image?: string | null
  /** Verilmezse backend tüm hizmetleri atar. */
  service_ids?: number[]
}

/** photo_image: null fotoğrafı kaldırır. */
export type AdminStaffUpdate = Partial<AdminStaffCreate> & { is_active?: boolean }

export interface WorkingHour {
  day_of_week: number // 0=Pazar ... 6=Cumartesi (JS getDay)
  start_time: string
  end_time: string
}

export interface TimeOff {
  id: number
  staff_id: number
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  reason: string | null
  conflicting_appointments?: number
}

export interface SiteLink {
  url: string
  /** Baskıya uygun QR (SVG data URI). */
  qr: string
}

/** "Bugün kapalıyım": işletmenin tek günlük kapalılık durumu. */
export interface Closure {
  date: string
  closed: boolean
  /** O gün için mevcut onaylı randevu sayısı (kapatınca iptal edilmez). */
  confirmed_appointments: number
}

export interface TimeOffCreate {
  staff_id: number
  start_date: string
  end_date: string
  reason?: string | null
  start_time?: string | null
  end_time?: string | null
}

export interface PaymentMethod {
  id: number
  name: string
  details: Record<string, unknown> | null
  is_active: boolean
}

export interface PaymentMethodCreate {
  name: string
  details?: Record<string, unknown> | null
  is_active?: boolean
}

export type PaymentMethodUpdate = Partial<PaymentMethodCreate>

export interface TenantSettings {
  business_name: string
  business_address: string | null
  logo_image: string | null
  banner_image: string | null
  notification_banner_enabled: boolean
  /** Müşteri sitesinde gösterilir; 10 hane (başında 0 yok) ve Instagram kullanıcı adı. */
  contact_phone: string | null
  whatsapp_phone: string | null
  instagram: string | null
}

export interface WhatsappStatus {
  state: 'open' | 'connecting' | 'close'
  /** 90... biçimi */
  phone: string | null
  profile_name: string | null
  connected_at: string | null
  server_reachable: boolean
  /** Platform gönderimi durdurdu. */
  paused: boolean
  paused_reason: string | null
  /** Dolu: sahip kesmeden hat koptu ('logged_out' | 'forbidden' | 'connection_lost' | 'health_check' | ...). */
  disconnect_reason: string | null
  disconnected_at: string | null
}

export interface PlatformWhatsapp extends WhatsappStatus {
  instance_name: string | null
  consecutive_failures: number
  sent_24h: number
  failed_24h: number
  queue_pending: number
  unverified_last_hour: number
  breaker_threshold: number
  abuse_alerted_at: string | null
}

export interface WhatsappAlert {
  tenant_id: number
  name: string
  kind: 'paused' | 'disconnected'
  reason: string | null
  since: string | null
}

export interface WhatsappConnectOut extends WhatsappStatus {
  /** data URL; <img src> olarak kullanılır. ~40 sn geçerli. */
  qr_base64: string | null
  pairing_code: string | null
}

export interface AdminCustomer {
  id: number
  name: string
  surname: string
  phone: string
  created_at: string
  appointment_count: number
  last_appointment_date: string | null
}

/* ---------- Platform ---------- */

export interface PlatformMe {
  id: number
  phone: string
  name?: string | null
  totp_enabled?: boolean
  mfa_setup_required?: boolean
}

export interface PlatformLoginResponse {
  access_token: string | null
  token_type: string
  mfa_required: boolean
  mfa_token: string | null
  mfa_setup_required: boolean
}

export interface TwoFactorStatus {
  enabled: boolean
  required: boolean
  backup_codes_remaining: number
}

export interface TwoFactorSetupOut {
  secret: string
  otpauth_uri: string
  /** data:image/svg+xml;base64,... */
  qr: string
}

export interface TwoFactorConfirmOut {
  backup_codes: string[]
  access_token: string
}

export interface MetricsOverview {
  mrr: number
  arr: number
  paying_tenants: number
  trial_tenants: number
  month_collected: number
  plan_distribution: { plan_name: string; tenants: number; mrr: number }[]
  renewals_next_30: { tenant_id: number; tenant_name: string; slug: string; end_date: string; days_left: number; amount_due: number; is_trial: boolean }[]
  monthly_revenue: { month: string; revenue: number }[]
  churned_last_30: { tenant_id: number; tenant_name: string; reason: string }[]
  at_risk: {
    tenant_id: number
    tenant_name: string
    slug: string
    last_appointment_date: string | null
    days_since: number
    appointments_30d: number
    appointments_prev_30d: number
    reason: string
  }[]
  top_usage: { tenant_id: number; tenant_name: string; appointments_30d: number }[]
}

export interface PlatformStats {
  tenant_count: number
  active_tenant_count: number
  total_appointments: number
  appointments_last_30_days: number
}

export interface PlatformTenant {
  id: number
  name: string
  slug: string
  is_active: boolean
  created_at: string
  staff_count: number
  appointment_count: number
  /** İlk eklenen super_admin; yoksa null. */
  owner_name: string | null
  owner_phone: string | null
  auto_suspended: boolean
  note: string | null
  setup: TenantSetup | null
  /** Self-servis kayıt başvurusu durumu; elle açılan işletmelerde null. */
  signup_status: SignupStatus | null
  /** Gizli personel giriş adresi ("/panel/g/<key>"). */
  panel_login_path: string | null
}

export type SignupStatus = 'pending' | 'approved' | 'rejected'

export interface SignupRequest {
  name: string
  slug: string
  owner_name: string
  owner_surname: string
  owner_phone: string
  password: string
  email?: string
  accept_terms: boolean
}

export interface SignupResponse {
  message: string
  slug: string
}

export interface SetupCheck {
  key: string
  label: string
  ok: boolean
  hint: string
}

export interface TenantSetup {
  ready: boolean
  missing_count: number
  checks: SetupCheck[]
}

export interface TenantOwner {
  id: number
  name: string
  surname: string
  phone: string
}

export interface PlatformTenantDetail extends PlatformTenant {
  owner: TenantOwner | null
}

export interface PlatformTenantPage {
  items: PlatformTenant[]
  total: number
  limit: number
  offset: number
}

export interface PlatformTenantOption {
  id: number
  name: string
  slug: string
}

export type TenantStatusFilter = 'all' | 'active' | 'inactive' | 'suspended' | 'pending' | 'rejected' | 'trial'
export type TenantSort = 'name' | '-name' | 'created' | '-created' | 'staff' | '-staff' | 'appointments' | '-appointments'

export interface TenantListParams {
  search?: string
  status?: TenantStatusFilter
  sort?: TenantSort
  limit?: number
  offset?: number
}

export interface OwnerUpdate {
  name?: string
  surname?: string
  phone?: string
}

export interface PlatformTenantCreate {
  name: string
  slug: string
  owner_name: string
  owner_surname: string
  owner_phone: string
  owner_password: string
  start_trial?: boolean
  trial_days?: number
}

export interface PlatformTenantUpdate {
  name?: string
  is_active?: boolean
  note?: string
}

/* ---------- Platform: abonelik & ödeme takibi ---------- */

export interface Plan {
  id: number
  name: string
  duration_months: number
  price: number
  is_active: boolean
  sort_order: number
}

export interface PlanCreate {
  name: string
  duration_months: number
  price: number
  is_active?: boolean
  sort_order?: number
}

export type PlanUpdate = Partial<PlanCreate>

export type BillingStatus = 'untracked' | 'scheduled' | 'trial' | 'active' | 'due_soon' | 'grace' | 'expired'
export type PaymentStatus = 'paid' | 'partial' | 'unpaid'

export interface Subscription {
  id: number
  tenant_id: number
  plan_id: number | null
  plan_name: string
  start_date: string
  end_date: string
  /** Ödenecek (indirimli) tutar. */
  price: number
  /** İndirimsizse null. */
  list_price: number | null
  discount_percent: number
  note: string | null
  paid_amount: number
  balance: number
  payment_status: PaymentStatus
  reminded_at: string | null
  created_at: string
  is_custom: boolean
  is_trial: boolean
}

export interface InitialPayment {
  amount: number
  paid_on: string
  method?: string
  note?: string | null
}

export interface SubscriptionCreate {
  plan_id?: number | null
  plan_name?: string
  start_date: string
  end_date?: string
  /** Liste fiyatı (boşsa paketin fiyatı). */
  price?: number
  discount_percent?: number
  note?: string | null
  initial_payment?: InitialPayment
}

export interface SubscriptionUpdate {
  plan_name?: string
  start_date?: string
  end_date?: string
  price?: number
  discount_percent?: number
  note?: string | null
}

export interface SubscriptionSuggestion {
  start_date: string
  end_date: string
  price: number
}

export interface TenantBilling {
  tenant_id: number
  tenant_name: string
  slug: string
  is_active: boolean
  auto_suspended_at: string | null
  owner_name: string | null
  owner_phone: string | null
  status: BillingStatus
  coverage_end: string | null
  days_left: number | null
  current: Subscription | null
  next: Subscription | null
  outstanding: number
  last_payment_on: string | null
  reminded_at: string | null
  /** Son dönemin paketi aktifse güncel liste fiyatı, değilse son dönemin fiyatı. */
  renewal_plan_name: string | null
  renewal_price: number | null
  /** Şu an istenecek tutar: ödenmemiş bakiye, yoksa (yenileme zamanıysa) yenileme tutarı. */
  amount_due: number
  /** Son dönem deneme mi (status=expired + is_trial => "Deneme bitti"). */
  is_trial: boolean
  trial_ending: boolean
}

export interface BillingStats {
  revenue_this_month: number
  revenue_this_year: number
  revenue_last_30_days: number
  outstanding_total: number
  due_soon_count: number
  grace_count: number
  expired_count: number
  tracked_count: number
  untracked_count: number
  trial_count: number
  trial_ending_count: number
  /** 0..1; hiç biten deneme yoksa null. */
  trial_conversion_rate: number | null
}

export interface Payment {
  id: number
  tenant_id: number
  tenant_name: string
  subscription_id: number | null
  subscription_label: string | null
  amount: number
  paid_on: string
  method: string
  note: string | null
  created_at: string
}

export interface PaymentCreate {
  tenant_id: number
  subscription_id?: number | null
  amount: number
  paid_on: string
  method?: string
  note?: string | null
}

export interface BillingOverview {
  stats: BillingStats
  attention: TenantBilling[]
  recent_payments: Payment[]
}

export interface PaymentsParams {
  tenant_id?: number
  date_from?: string
  date_to?: string
}

export interface PlatformSettings {
  iban: string | null
  account_holder: string | null
  bank_name: string | null
  reminder_days: number
  grace_days: number
  notify_email: string | null
  reminder_template: string
  overdue_template: string
  trial_template: string
}

export interface PlatformSettingsOut extends PlatformSettings {
  email_configured: boolean
  push_configured: boolean
}

export interface RunChecksResult {
  checked: number
  notified: number
  suspended: string[]
  reactivated: string[]
  email_sent: boolean
  push_sent: number
}

export interface PushSubscribeRequest {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/* ---------- Platform: yöneticiler, denetim kaydı, sistem ---------- */

export interface PlatformAdmin {
  id: number
  phone: string
  name: string | null
  is_active: boolean
  last_login_at: string | null
  created_at: string
  is_me: boolean
  totp_enabled: boolean
}

export interface PlatformAdminCreate {
  phone: string
  name?: string | null
  password: string
}

export interface PlatformAdminUpdate {
  name?: string | null
  phone?: string
  is_active?: boolean
}

export interface ChangePasswordRequest {
  current_password: string
  new_password: string
}

export interface AuditLog {
  id: number
  created_at: string
  actor_type: 'platform_admin' | 'staff' | 'system'
  actor_id: number | null
  actor_label: string
  action: string
  action_label: string
  entity_type: string | null
  entity_id: number | null
  tenant_id: number | null
  tenant_name: string | null
  summary: string
  details: Record<string, unknown> | null
  ip: string | null
}

export interface AuditPage {
  items: AuditLog[]
  total: number
  limit: number
  offset: number
}

export interface AuditParams {
  limit?: number
  offset?: number
  action?: string
  group?: string
  tenant_id?: number
  actor_id?: number
  date_from?: string
  date_to?: string
  q?: string
}

export interface AuditActionInfo {
  value: string
  label: string
  group: string
}

export interface JobRun {
  id: number
  job: string
  trigger: 'cron' | 'manual'
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  ok: boolean
  result: Record<string, unknown> | null
  error: string | null
}

export interface SystemStatus {
  server_time: string
  db: { ok: boolean; size_mb: number }
  billing_job: {
    last_run: JobRun | null
    last_ok_at: string | null
    hours_since_last_ok: number | null
    overdue: boolean
  }
  backup: {
    last_backup_at: string | null
    file: string | null
    size_mb: number | null
    age_hours: number | null
    ok: boolean
    verified_at: string | null
    verified_ok: boolean | null
  }
  channels: {
    email_configured: boolean
    push_configured: boolean
    push_subscribers: number
    whatsapp_configured: boolean
    whatsapp_reachable: boolean | null
    /** 'open' = bağlı, 'connecting', 'close' ... */
    /** Artık hep null (ortak hat kaldırıldı). */
    whatsapp_state: string | null
    whatsapp_connected_tenants: number
  }
  whatsapp: {
    sent_24h: number
    failed_24h: number
    hourly_limit: number
    queue_pending: number
    alerts: WhatsappAlert[]
    top_tenants: { tenant_id: number | null; name: string; sent: number; failed: number }[]
  }
  counts: {
    tenants: number
    active_tenants: number
    platform_admins: number
    audit_logs_last_24h: number
    failed_logins_last_24h: number
  }
}

export interface ImpersonateStart {
  read_only?: boolean
  staff_id?: number
}

export interface ImpersonateStartOut {
  code: string
  slug: string
  expires_in: number
}

/* ---------- Duyurular ---------- */

export type AnnouncementLevel = 'info' | 'warning' | 'critical'
export type AnnouncementStatus = 'scheduled' | 'active' | 'ended'

export interface AnnouncementIn {
  title: string
  body: string
  level: AnnouncementLevel
  target_all: boolean
  tenant_ids: number[]
  starts_on?: string
  ends_on?: string | null
}

export interface AnnouncementUpdate extends Partial<AnnouncementIn> {
  clear_ends_on?: boolean
}

export interface AnnouncementOut {
  id: number
  title: string
  body: string
  level: AnnouncementLevel
  target_all: boolean
  tenant_ids: number[]
  starts_on: string
  ends_on: string | null
  status: AnnouncementStatus
  created_at: string
  target_count: number
  read_count: number
}

/* ---------- Bildirim kutusu ---------- */

export interface InboxItem {
  key: string
  source: 'announcement' | 'notification'
  kind: 'announcement' | 'message' | 'whatsapp'
  level: AnnouncementLevel
  title: string
  body: string
  link: string | null
  created_at: string | null
  read: boolean
}

export interface InboxOut {
  unread: number
  items: InboxItem[]
}

export interface NotificationIn {
  title: string
  body: string
  level: AnnouncementLevel
}

export interface NotificationOut extends NotificationIn {
  id: number
  kind: string
  created_at: string | null
  read_at: string | null
}

export interface PanelAnnouncement {
  id: number
  title: string
  body: string
  level: AnnouncementLevel
}
