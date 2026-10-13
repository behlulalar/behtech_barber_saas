// Tek tip güvenli API istemcisi. Sayfa ajanları bu dosyayı DEĞİŞTİRMEZ.
// Gruplar: publicApi, customerApi, authApi, adminApi, platformApi.
import type {
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
  AppointmentPublicOut,
  AvailabilityParams,
  CreateAppointmentRequest,
  DashboardOut,
  HealthResponse,
  LoginRequest,
  PaymentMethod,
  PaymentMethodCreate,
  PaymentMethodUpdate,
  PlatformMe,
  PlatformStats,
  PlatformTenant,
  PlatformTenantCreate,
  PlatformTenantUpdate,
  PublicService,
  PublicStaff,
  PublicTenant,
  SendCodeRequest,
  SendCodeResponse,
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
}

/* ------------------------------------------------------------------ */
/* Personel paneli (staff token)                                       */
/* ------------------------------------------------------------------ */

const s = 'staff' as const

export const adminApi = {
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
  listTenants: () => request<PlatformTenant[]>('/platform/tenants', { auth: p }),
  createTenant: (data: PlatformTenantCreate) =>
    request<PlatformTenant>('/platform/tenants', { method: 'POST', body: data, auth: p }),
  updateTenant: (id: number, data: PlatformTenantUpdate) =>
    request<PlatformTenant>(`/platform/tenants/${id}`, { method: 'PATCH', body: data, auth: p }),
}
