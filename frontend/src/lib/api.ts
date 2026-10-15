// Tek tip güvenli API istemcisi. Sayfa ajanları bu dosyayı DEĞİŞTİRMEZ.
// Gruplar: publicApi, customerApi, authApi, adminApi, platformApi.
import type {
  AnnouncementIn,
  AnnouncementOut,
  AnnouncementUpdate,
  PanelAnnouncement,
  SignupRequest,
  SignupResponse,
  AdminAppointmentCreate,
  AdminAppointmentOut,
  AdminAppointmentsParams,
  AdminAppointmentUpdate,
  AdminCustomer,
  AdminService,
  AdminServiceCreate,
  AdminServiceUpdate,
  AdminStaff,
  AdminStaffCreate,
  AdminStaffUpdate,
  AuditActionInfo,
  AuditPage,
  AuditParams,
  ChangePasswordRequest,
  JobRun,
  PlatformAdmin,
  PlatformAdminCreate,
  PlatformAdminUpdate,
  SystemStatus,
  AppointmentPublicOut,
  AvailabilityParams,
  BillingOverview,
  Payment,
  PaymentCreate,
  PaymentsParams,
  Plan,
  PlanCreate,
  PlanUpdate,
  PlatformSettings,
  PlatformSettingsOut,
  PushSubscribeRequest,
  RunChecksResult,
  Subscription,
  SubscriptionCreate,
  SubscriptionSuggestion,
  SubscriptionUpdate,
  TenantBilling,
  CreateAppointmentRequest,
  DashboardOut,
  ReportPeriod,
  RevenueReport,
  HealthResponse,
  ImpersonateStart,
  ImpersonateStartOut,
  LoginRequest,
  PaymentMethod,
  PaymentMethodCreate,
  PaymentMethodUpdate,
  PlatformMe,
  PlatformStats,
  MetricsOverview,
  PlatformTenant,
  PlatformTenantDetail,
  PlatformTenantOption,
  PlatformTenantPage,
  OwnerUpdate,
  TenantListParams,
  PlatformTenantCreate,
  PlatformTenantUpdate,
  PublicService,
  PublicStaff,
  PublicTenant,
  SendCodeRequest,
  SendCodeResponse,
  SlotsResponse,
  StaffMe,
  TenantSettings,
  TimeOff,
  TimeOffCreate,
  TokenResponse,
  VerifyCodeRequest,
  VerifyCodeResponse,
  WorkingHour,
} from '../types/api'

/* ------------------------------------------------------------------ */
/* Token deposu                                                        */
/* ------------------------------------------------------------------ */

export type TokenKind = 'staff' | 'customer' | 'platform'

const STORAGE_KEYS: Record<TokenKind, string> = {
  staff: 'beh.staff_token',
  customer: 'beh.customer_token',
  platform: 'beh.platform_token',
}

export const LOGIN_PATHS: Record<Exclude<TokenKind, 'customer'>, string> = {
  staff: '/panel/giris',
  platform: '/platform/giris',
}

/** Bir token silindiğinde / değiştiğinde auth sağlayıcıları bu olayı dinler. */
export const AUTH_EVENT = 'beh:auth-change'

export const tokenStore = {
  get(kind: TokenKind): string | null {
    try {
      return localStorage.getItem(STORAGE_KEYS[kind])
    } catch {
      return null
    }
  },
  set(kind: TokenKind, token: string): void {
    try {
      localStorage.setItem(STORAGE_KEYS[kind], token)
    } catch {
      /* gizli mod vb. — oturum sadece bellekte kalmaz, sorun değil */
    }
    window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: { kind } }))
  },
  clear(kind: TokenKind): void {
    try {
      localStorage.removeItem(STORAGE_KEYS[kind])
    } catch {
      /* yoksay */
    }
    window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: { kind } }))
  },
}

/** JWT `exp` değerini (ms cinsinden) döndürür; çözülemezse null. */
export function tokenExpiresAt(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const exp = (JSON.parse(json) as { exp?: number }).exp
    return typeof exp === 'number' ? exp * 1000 : null
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Hata ve istek yardımcısı                                            */
/* ------------------------------------------------------------------ */

export class ApiError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

/** Herhangi bir hatadan kullanıcıya gösterilecek Türkçe mesajı çıkarır. */
export function errorMessage(err: unknown, fallback = 'Bir şeyler ters gitti. Lütfen tekrar deneyin.'): string {
  if (err instanceof ApiError) return err.detail
  return fallback
}

type Query = Record<string, string | number | boolean | null | undefined>

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Query
  /** Hangi token enjekte edilecek (yoksa anonim istek). */
  auth?: TokenKind
  signal?: AbortSignal
}

function buildQuery(query?: Query): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

function parseDetail(body: unknown): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string }
      // Pydantic özel doğrulayıcı mesajlarının başına "Value error, " ekler; kullanıcıya göstermiyoruz.
      if (first?.msg) return first.msg.replace(/^Value error, /, "")
    }
  }
  return 'Bilinmeyen bir hata oluştu.'
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, auth, signal } = options
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let sentToken: string | null = null
  if (auth) {
    sentToken = tokenStore.get(auth)
    if (sentToken) headers.Authorization = `Bearer ${sentToken}`
  }

  let response: Response
  try {
    response = await fetch(`/api${path}${buildQuery(query)}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(0, 'Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin.')
  }

  if (!response.ok) {
    const parsed: unknown = await response.json().catch(() => null)
    if (response.status === 401 && auth && sentToken) {
      handleUnauthorized(auth)
    }
    throw new ApiError(response.status, parseDetail(parsed))
  }

  if (response.status === 204) return undefined as T
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

function handleUnauthorized(kind: TokenKind): void {
  tokenStore.clear(kind)
  if (kind === 'customer') return // müşteri akışı kendi içinde yeniden doğrulama ister
  const loginPath = LOGIN_PATHS[kind]
  if (!window.location.pathname.startsWith(loginPath)) {
    window.location.assign(loginPath)
  }
}

/* ------------------------------------------------------------------ */
/* Public (anonim)                                                     */
/* ------------------------------------------------------------------ */

export const publicApi = {
  health: () => request<HealthResponse>('/health'),
  getTenant: () => request<PublicTenant>('/public/tenant'),
  getStaff: () => request<PublicStaff[]>('/staff'),
  getServices: () => request<PublicService[]>('/services'),
  /** Müsait başlangıç saatleri: ["09:00:00", ...] */
  getAvailability: (p: AvailabilityParams) => request<string[]>('/availability', { query: { ...p } }),
  getSlots: (p: AvailabilityParams) => request<SlotsResponse>('/availability/slots', { query: { ...p } }),
  signup: (data: SignupRequest) => request<SignupResponse>('/public/signup', { method: 'POST', body: data }),
  sendCode: (data: SendCodeRequest) => request<SendCodeResponse>('/auth/send-code', { method: 'POST', body: data }),
  /** Başarılı olunca yanıtı useCustomerAuth().login(response) ile kaydedin. */
  verifyCode: (data: VerifyCodeRequest) =>
    request<VerifyCodeResponse>('/auth/verify-code', { method: 'POST', body: data }),
}

/* ------------------------------------------------------------------ */
/* Müşteri (customer token)                                            */
/* ------------------------------------------------------------------ */

export const customerApi = {
  createAppointment: (data: CreateAppointmentRequest) =>
    request<AppointmentPublicOut>('/appointments', { method: 'POST', body: data, auth: 'customer' }),
  listAppointments: () => request<AppointmentPublicOut[]>('/customer/appointments', { auth: 'customer' }),
  cancelAppointment: (id: number) =>
    request<AppointmentPublicOut>(`/customer/appointments/${id}/cancel`, { method: 'POST', auth: 'customer' }),
}

/* ------------------------------------------------------------------ */
/* Personel girişi                                                     */
/* ------------------------------------------------------------------ */

export const authApi = {
  login: (data: LoginRequest) => request<TokenResponse>('/auth/login', { method: 'POST', body: data }),
  me: () => request<StaffMe>('/auth/me', { auth: 'staff' }),
  /** Destek girişi: platform panelinden alınan tek kullanımlık kodu personel token'ına çevirir. */
  impersonate: (code: string) => request<TokenResponse>('/auth/impersonate', { method: 'POST', body: { code } }),
  endImpersonation: () => request<void>('/auth/impersonate/end', { method: 'POST', auth: 'staff' }),
  /** Yeni token döner (diğer cihazların oturumları düşer). */
  changePassword: (data: { current_password: string; new_password: string }) =>
    request<TokenResponse>('/auth/me/password', { method: 'POST', body: data, auth: 'staff' }),
  logoutAll: () => request<void>('/auth/me/logout-all', { method: 'POST', auth: 'staff' }),
  forgotSendCode: (phone: string) => request<SendCodeResponse>('/auth/forgot/send-code', { method: 'POST', body: { phone } }),
  forgotReset: (data: { phone: string; code: string; new_password: string }) =>
    request<void>('/auth/forgot/reset', { method: 'POST', body: data }),
}

/* ------------------------------------------------------------------ */
/* Personel paneli (staff token)                                       */
/* ------------------------------------------------------------------ */

const s = 'staff' as const

export const adminApi = {
  listAnnouncements: () => request<PanelAnnouncement[]>('/admin/announcements', { auth: s }),

  getRevenueReport: (period: ReportPeriod, date: string, staffId?: number) =>
    request<RevenueReport>('/admin/reports/revenue', { auth: s, query: { period, date, staff_id: staffId } }),

  getDashboard: (date?: string) => request<DashboardOut>('/admin/dashboard', { auth: s, query: { date } }),

  listAppointments: (params: AdminAppointmentsParams = {}) =>
    request<AdminAppointmentOut[]>('/admin/appointments', { auth: s, query: { ...params } }),
  createAppointment: (data: AdminAppointmentCreate) =>
    request<AdminAppointmentOut>('/admin/appointments', { method: 'POST', body: data, auth: s }),
  updateAppointment: (id: number, data: AdminAppointmentUpdate) =>
    request<AdminAppointmentOut>(`/admin/appointments/${id}`, { method: 'PATCH', body: data, auth: s }),

  listServices: () => request<AdminService[]>('/admin/services', { auth: s }),
  createService: (data: AdminServiceCreate) =>
    request<AdminService>('/admin/services', { method: 'POST', body: data, auth: s }),
  updateService: (id: number, data: AdminServiceUpdate) =>
    request<AdminService>(`/admin/services/${id}`, { method: 'PATCH', body: data, auth: s }),
  deleteService: (id: number) => request<void>(`/admin/services/${id}`, { method: 'DELETE', auth: s }),

  listStaff: () => request<AdminStaff[]>('/admin/staff', { auth: s }),
  createStaff: (data: AdminStaffCreate) => request<AdminStaff>('/admin/staff', { method: 'POST', body: data, auth: s }),
  updateStaff: (id: number, data: AdminStaffUpdate) =>
    request<AdminStaff>(`/admin/staff/${id}`, { method: 'PATCH', body: data, auth: s }),
  deleteStaff: (id: number) => request<void>(`/admin/staff/${id}`, { method: 'DELETE', auth: s }),

  getWorkingHours: (staffId?: number) =>
    request<WorkingHour[]>('/admin/working-hours', { auth: s, query: { staff_id: staffId } }),
  /** Verilen personelin tüm çalışma saatlerini değiştirir (listede olmayan gün = kapalı). */
  setWorkingHours: (staffId: number, hours: WorkingHour[]) =>
    request<WorkingHour[]>(`/admin/working-hours/${staffId}`, { method: 'PUT', body: hours, auth: s }),

  listTimeOff: (staffId?: number) => request<TimeOff[]>('/admin/time-off', { auth: s, query: { staff_id: staffId } }),
  createTimeOff: (data: TimeOffCreate) => request<TimeOff>('/admin/time-off', { method: 'POST', body: data, auth: s }),
  deleteTimeOff: (id: number) => request<void>(`/admin/time-off/${id}`, { method: 'DELETE', auth: s }),

  listPaymentMethods: () => request<PaymentMethod[]>('/admin/payment-methods', { auth: s }),
  createPaymentMethod: (data: PaymentMethodCreate) =>
    request<PaymentMethod>('/admin/payment-methods', { method: 'POST', body: data, auth: s }),
  updatePaymentMethod: (id: number, data: PaymentMethodUpdate) =>
    request<PaymentMethod>(`/admin/payment-methods/${id}`, { method: 'PATCH', body: data, auth: s }),
  deletePaymentMethod: (id: number) => request<void>(`/admin/payment-methods/${id}`, { method: 'DELETE', auth: s }),

  getSettings: () => request<TenantSettings>('/admin/settings', { auth: s }),
  updateSettings: (data: TenantSettings) =>
    request<TenantSettings>('/admin/settings', { method: 'PUT', body: data, auth: s }),

  listCustomers: (q?: string) => request<AdminCustomer[]>('/admin/customers', { auth: s, query: { q } }),
}

/* ------------------------------------------------------------------ */
/* Platform (platform token)                                           */
/* ------------------------------------------------------------------ */

const p = 'platform' as const

export const platformApi = {
  login: (data: LoginRequest) => request<TokenResponse>('/platform/login', { method: 'POST', body: data }),
  me: () => request<PlatformMe>('/platform/me', { auth: p }),
  getStats: () => request<PlatformStats>('/platform/stats', { auth: p }),
  getMetrics: () => request<MetricsOverview>('/platform/metrics/overview', { auth: p }),
  listTenants: (params?: TenantListParams) =>
    request<PlatformTenantPage>('/platform/tenants', { auth: p, query: { ...params } }),
  listTenantOptions: () => request<PlatformTenantOption[]>('/platform/tenants/options', { auth: p }),
  getTenant: (id: number) => request<PlatformTenantDetail>(`/platform/tenants/${id}`, { auth: p }),
  updateOwner: (id: number, data: OwnerUpdate) =>
    request<PlatformTenantDetail>(`/platform/tenants/${id}/owner`, { method: 'PATCH', body: data, auth: p }),
  resetOwnerPassword: (id: number, password?: string) =>
    request<{ password: string }>(`/platform/tenants/${id}/owner/reset-password`, {
      method: 'POST',
      body: password ? { password } : {},
      auth: p,
    }),
  createTenant: (data: PlatformTenantCreate) =>
    request<PlatformTenant>('/platform/tenants', { method: 'POST', body: data, auth: p }),
  startImpersonation: (id: number, data: ImpersonateStart) =>
    request<ImpersonateStartOut>(`/platform/tenants/${id}/impersonate`, { method: 'POST', body: data, auth: p }),
  startTrial: (tenantId: number, data?: { days?: number; start_date?: string }) =>
    request<Subscription>(`/platform/tenants/${tenantId}/trial`, { method: 'POST', body: data ?? {}, auth: p }),
  approveSignup: (id: number) => request<PlatformTenant>(`/platform/tenants/${id}/signup/approve`, { method: 'POST', auth: p }),
  rejectSignup: (id: number) => request<PlatformTenant>(`/platform/tenants/${id}/signup/reject`, { method: 'POST', auth: p }),
  updateTenant: (id: number, data: PlatformTenantUpdate) =>
    request<PlatformTenant>(`/platform/tenants/${id}`, { method: 'PATCH', body: data, auth: p }),
  /* Paketler */
  listPlans: () => request<Plan[]>('/platform/plans', { auth: p }),
  createPlan: (data: PlanCreate) => request<Plan>('/platform/plans', { method: 'POST', body: data, auth: p }),
  updatePlan: (id: number, data: PlanUpdate) =>
    request<Plan>(`/platform/plans/${id}`, { method: 'PATCH', body: data, auth: p }),
  deletePlan: (id: number) => request<void>(`/platform/plans/${id}`, { method: 'DELETE', auth: p }),

  /* Billing */
  getBillingOverview: () => request<BillingOverview>('/platform/billing/overview', { auth: p }),
  listTenantBilling: () => request<TenantBilling[]>('/platform/billing/tenants', { auth: p }),
  runChecks: () => request<RunChecksResult>('/platform/billing/run-checks', { method: 'POST', auth: p }),

  /* Dönemler */
  listSubscriptions: (tenantId: number) =>
    request<Subscription[]>(`/platform/tenants/${tenantId}/subscriptions`, { auth: p }),
  suggestSubscription: (tenantId: number, planId: number) =>
    request<SubscriptionSuggestion>(`/platform/tenants/${tenantId}/subscriptions/suggest`, {
      auth: p,
      query: { plan_id: planId },
    }),
  createSubscription: (tenantId: number, data: SubscriptionCreate) =>
    request<Subscription>(`/platform/tenants/${tenantId}/subscriptions`, { method: 'POST', body: data, auth: p }),
  updateSubscription: (id: number, data: SubscriptionUpdate) =>
    request<Subscription>(`/platform/subscriptions/${id}`, { method: 'PATCH', body: data, auth: p }),
  deleteSubscription: (id: number) => request<void>(`/platform/subscriptions/${id}`, { method: 'DELETE', auth: p }),
  markReminded: (id: number) => request<Subscription>(`/platform/subscriptions/${id}/reminded`, { method: 'POST', auth: p }),

  /* Ödemeler */
  listPayments: (params?: PaymentsParams) => request<Payment[]>('/platform/payments', { auth: p, query: { ...params } }),
  createPayment: (data: PaymentCreate) => request<Payment>('/platform/payments', { method: 'POST', body: data, auth: p }),
  deletePayment: (id: number) => request<void>(`/platform/payments/${id}`, { method: 'DELETE', auth: p }),

  /* Ayarlar */
  getSettings: () => request<PlatformSettingsOut>('/platform/settings', { auth: p }),
  updateSettings: (data: PlatformSettings) =>
    request<PlatformSettingsOut>('/platform/settings', { method: 'PUT', body: data, auth: p }),

  /* Push */
  getPushPublicKey: () => request<{ public_key: string | null }>('/platform/push/public-key', { auth: p }),
  pushSubscribe: (data: PushSubscribeRequest) =>
    request<void>('/platform/push/subscribe', { method: 'POST', body: data, auth: p }),
  pushUnsubscribe: (endpoint: string) =>
    request<void>('/platform/push/unsubscribe', { method: 'POST', body: { endpoint }, auth: p }),
  pushTest: () => request<{ sent: number }>('/platform/push/test', { method: 'POST', auth: p }),

  /* Yöneticiler & hesabım */
  listAdmins: () => request<PlatformAdmin[]>('/platform/admins', { auth: p }),
  createAdmin: (data: PlatformAdminCreate) =>
    request<PlatformAdmin>('/platform/admins', { method: 'POST', body: data, auth: p }),
  updateAdmin: (id: number, data: PlatformAdminUpdate) =>
    request<PlatformAdmin>(`/platform/admins/${id}`, { method: 'PATCH', body: data, auth: p }),
  resetAdminPassword: (id: number, password: string) =>
    request<void>(`/platform/admins/${id}/reset-password`, { method: 'POST', body: { password }, auth: p }),
  deleteAdmin: (id: number) => request<void>(`/platform/admins/${id}`, { method: 'DELETE', auth: p }),
  /** Şifreyi değiştirir ve dönen yeni token'ı saklar (diğer cihazların oturumu düşer). */
  changePassword: async (data: ChangePasswordRequest) => {
    const res = await request<TokenResponse>('/platform/me/password', { method: 'POST', body: data, auth: p })
    tokenStore.set('platform', res.access_token)
    return res
  },
  logoutAll: () => request<void>('/platform/me/logout-all', { method: 'POST', auth: p }),

  /* Denetim kaydı */
  listAudit: (params?: AuditParams) => request<AuditPage>('/platform/audit', { auth: p, query: { ...params } }),
  listAuditActions: () => request<AuditActionInfo[]>('/platform/audit/actions', { auth: p }),

  /* Duyurular */
  listAnnouncements: () => request<AnnouncementOut[]>('/platform/announcements', { auth: p }),
  createAnnouncement: (data: AnnouncementIn) =>
    request<AnnouncementOut>('/platform/announcements', { method: 'POST', body: data, auth: p }),
  updateAnnouncement: (id: number, data: AnnouncementUpdate) =>
    request<AnnouncementOut>(`/platform/announcements/${id}`, { method: 'PATCH', body: data, auth: p }),
  deleteAnnouncement: (id: number) => request<void>(`/platform/announcements/${id}`, { method: 'DELETE', auth: p }),

  /* Sistem */
  getSystemStatus: () => request<SystemStatus>('/platform/system/status', { auth: p }),
  listJobRuns: (job = 'billing_checks', limit = 10) =>
    request<JobRun[]>('/platform/jobs/runs', { auth: p, query: { job, limit } }),
}
