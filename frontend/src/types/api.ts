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
