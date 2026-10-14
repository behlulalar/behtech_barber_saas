// API sözleşmesinin (API_CONTRACT.md) tüm istek/yanıt tipleri.
// Tarih: 'YYYY-MM-DD'. Saat: yanıtlarda 'HH:MM:SS', isteklerde 'HH:MM' veya 'HH:MM:SS'.
// Para: tam sayı TL. Telefon: 10 hane, başında 0 yok (5551234567).

export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
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
}

export interface PublicStaff extends StaffBrief {
  photo_image: string | null
  /** Bu berberin verdiği hizmetlerin id'leri; hizmet seçilince berber listesi buna göre süzülür. */
  service_ids: number[]
}
export type PublicService = ServiceBrief

export interface AvailabilityParams {
  staff_id: number
  service_id: number
  date: string
}

export interface SendCodeRequest {
  phone: string
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
  staff_id: number
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
  pending_today: number
  expected_revenue_today: number
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
  /** Bu hizmeti veren personel. */
  staff_ids: number[]
}

export interface AdminServiceCreate {
  name: string
  price: number
  duration_min: number
  is_active?: boolean
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
export type AdminStaffUpdate = Partial<AdminStaffCreate>

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
  reason: string | null
}

export interface TimeOffCreate {
  staff_id: number
  start_date: string
  end_date: string
  reason?: string | null
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
}

export interface PlatformTenantCreate {
  name: string
  slug: string
  owner_name: string
  owner_surname: string
  owner_phone: string
  owner_password: string
}

export interface PlatformTenantUpdate {
  name?: string
  is_active?: boolean
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

export type BillingStatus = 'untracked' | 'scheduled' | 'active' | 'due_soon' | 'grace' | 'expired'
export type PaymentStatus = 'paid' | 'partial' | 'unpaid'

export interface Subscription {
  id: number
  tenant_id: number
  plan_id: number | null
  plan_name: string
  start_date: string
  end_date: string
  price: number
  note: string | null
  paid_amount: number
  balance: number
  payment_status: PaymentStatus
  reminded_at: string | null
  created_at: string
  is_custom: boolean
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
  price?: number
  note?: string | null
  initial_payment?: InitialPayment
}

export interface SubscriptionUpdate {
  plan_name?: string
  start_date?: string
  end_date?: string
  price?: number
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
