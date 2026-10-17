// Üç bağımsız oturum: staff, customer, platform. Her biri kendi localStorage anahtarında.
import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { AUTH_EVENT, authApi, platformApi, tokenExpiresAt, tokenStore, type TokenKind } from './api'
import type { CustomerName, PlatformLoginResponse, PlatformMe, StaffMe, VerifyCodeResponse } from '../types/api'
import { Spinner } from '../components/ui/Spinner'
import { getPanelKey, panelLoginPath, setPanelKey } from './panelKey'

const NotFoundPage = lazy(() => import('../pages/NotFoundPage'))

/** Bir token'ı reaktif olarak izler (diğer sekmelerdeki değişiklikler dahil). */
function useToken(kind: TokenKind): string | null {
  const [token, setToken] = useState<string | null>(() => tokenStore.get(kind))
  useEffect(() => {
    const sync = () => setToken(tokenStore.get(kind))
    window.addEventListener(AUTH_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(AUTH_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [kind])
  return token
}

function FullScreenLoader() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-ink">
      <Spinner size="lg" label="Yükleniyor" />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Staff                                                               */
/* ------------------------------------------------------------------ */

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface StaffAuthValue {
  status: AuthStatus
  token: string | null
  me: StaffMe | null
  /** super_admin veya technical_support */
  isManager: boolean
  isOwner: boolean
  /** Giriş yapar; yanlış bilgilerde ApiError fırlatır. */
  login: (phone: string, password: string, remember?: boolean) => Promise<void>
  logout: () => void
}

const StaffAuthContext = createContext<StaffAuthValue | null>(null)

function StaffAuthProvider({ children }: { children: ReactNode }) {
  const token = useToken('staff')
  const [me, setMe] = useState<StaffMe | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    authApi
      .me()
      .then((data) => {
        if (!cancelled) setMe(data)
      })
      .catch(() => {
        /* 401 ise api.ts token'ı zaten temizledi */
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const login = useCallback(async (phone: string, password: string, remember = false) => {
    const res = await authApi.login({ phone, password, remember })
    setLoaded(false)
    tokenStore.set('staff', res.access_token)
  }, [])

  const logout = useCallback(() => {
    setMe(null)
    setLoaded(false)
    tokenStore.clear('staff')
  }, [])

  const value = useMemo<StaffAuthValue>(() => {
    const status: AuthStatus = !token ? 'unauthenticated' : me && loaded ? 'authenticated' : loaded ? 'unauthenticated' : 'loading'
    const role = me?.role
    return {
      status,
      token,
      me: token ? me : null,
      isManager: role === 'super_admin' || role === 'technical_support',
      isOwner: role === 'super_admin',
      login,
      logout,
    }
  }, [token, me, loaded, login, logout])

  return <StaffAuthContext.Provider value={value}>{children}</StaffAuthContext.Provider>
}

export function useStaffAuth(): StaffAuthValue {
  const ctx = useContext(StaffAuthContext)
  if (!ctx) throw new Error('useStaffAuth, AuthProviders içinde kullanılmalı')
  return ctx
}

/** Panel rotalarını korur. Layout route olarak (`<Outlet/>`) ya da sarmalayıcı olarak kullanılır. */
export function RequireStaff({ children, managerOnly }: { children?: ReactNode; managerOnly?: boolean }) {
  const { status, isManager } = useStaffAuth()
  const location = useLocation()
  // Kurulu uygulamanın başlangıç adresi `/panel?k=<anahtar>`: anahtarı bu cihazın depolamasına yaz, adresten sil, devam et.
  const params = new URLSearchParams(location.search)
  const handedKey = params.get('k')
  if (handedKey && /^[A-Za-z0-9]{6,40}$/.test(handedKey)) {
    setPanelKey(handedKey)
    params.delete('k')
    const rest = params.toString()
    return <Navigate to={location.pathname + (rest ? `?${rest}` : '')} replace />
  }
  if (status === 'loading') return <FullScreenLoader />
  if (status === 'unauthenticated') {
    // Panelin varlığı sızmasın: gizli giriş anahtarı bu cihazda yoksa 404 gösterilir.
    const key = getPanelKey()
    if (!key) {
      return (
        <Suspense fallback={<FullScreenLoader />}>
          <NotFoundPage />
        </Suspense>
      )
    }
    return <Navigate to={panelLoginPath(key)} replace state={{ from: location.pathname + location.search }} />
  }
  if (managerOnly && !isManager) return <Navigate to="/panel" replace />
  return <>{children ?? <Outlet />}</>
}

/* ------------------------------------------------------------------ */
/* Platform                                                            */
/* ------------------------------------------------------------------ */

interface PlatformAuthValue {
  status: AuthStatus
  token: string | null
  me: PlatformMe | null
  /** Şifre adımı. mfa_required ise oturum açılmaz; dönen mfa_token ile verifyMfa çağrılır. */
  login: (phone: string, password: string, remember?: boolean) => Promise<PlatformLoginResponse>
  verifyMfa: (mfaToken: string, code: string) => Promise<PlatformLoginResponse>
  /** Oturum token'ını değiştirir (ör. 2FA kurulumu sonrası tam yetkili token). */
  replaceToken: (token: string) => void
  logout: () => void
}

const PlatformAuthContext = createContext<PlatformAuthValue | null>(null)

function PlatformAuthProvider({ children }: { children: ReactNode }) {
  const token = useToken('platform')
  const [me, setMe] = useState<PlatformMe | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    platformApi
      .me()
      .then((data) => {
        if (!cancelled) setMe(data)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const applyLogin = useCallback((res: PlatformLoginResponse) => {
    if (!res.mfa_required && res.access_token) {
      setLoaded(false)
      tokenStore.set('platform', res.access_token)
    }
    return res
  }, [])

  const login = useCallback(
    async (phone: string, password: string, remember = false) =>
      applyLogin(await platformApi.login({ phone, password, remember })),
    [applyLogin],
  )

  const verifyMfa = useCallback(
    async (mfaToken: string, code: string) => applyLogin(await platformApi.loginMfa(mfaToken, code)),
    [applyLogin],
  )

  // Yükleniyor durumuna düşmeden token'ı değiştirir; me yeniden çekilir.
  const replaceToken = useCallback((next: string) => {
    tokenStore.set('platform', next)
  }, [])

  const logout = useCallback(() => {
    setMe(null)
    setLoaded(false)
    tokenStore.clear('platform')
  }, [])

  const value = useMemo<PlatformAuthValue>(() => {
    const status: AuthStatus = !token ? 'unauthenticated' : me && loaded ? 'authenticated' : loaded ? 'unauthenticated' : 'loading'
    return { status, token, me: token ? me : null, login, verifyMfa, replaceToken, logout }
  }, [token, me, loaded, login, verifyMfa, replaceToken, logout])

  return <PlatformAuthContext.Provider value={value}>{children}</PlatformAuthContext.Provider>
}

export function usePlatformAuth(): PlatformAuthValue {
  const ctx = useContext(PlatformAuthContext)
  if (!ctx) throw new Error('usePlatformAuth, AuthProviders içinde kullanılmalı')
  return ctx
}

export function RequirePlatform({ children }: { children?: ReactNode }) {
  const { status } = usePlatformAuth()
  const location = useLocation()
  if (status === 'loading') return <FullScreenLoader />
  if (status === 'unauthenticated') {
    return <Navigate to="/platform/giris" replace state={{ from: location.pathname }} />
  }
  return <>{children ?? <Outlet />}</>
}

/* ------------------------------------------------------------------ */
/* Customer (OTP, 30 dk ömürlü token)                                  */
/* ------------------------------------------------------------------ */

const CUSTOMER_PROFILE_KEY = 'beh.customer_profile'

interface CustomerProfile {
  phone: string | null
  customer: CustomerName | null
}

function readProfile(): CustomerProfile {
  try {
    const raw = localStorage.getItem(CUSTOMER_PROFILE_KEY)
    if (raw) return JSON.parse(raw) as CustomerProfile
  } catch {
    /* yoksay */
  }
  return { phone: null, customer: null }
}

function phoneFromToken(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const phone = (JSON.parse(json) as { phone?: string }).phone
    return typeof phone === 'string' ? phone : null
  } catch {
    return null
  }
}

interface CustomerAuthValue {
  /** Geçerli (süresi dolmamış) token varsa true. */
  isAuthenticated: boolean
  token: string | null
  /** Token'daki telefon (10 hane). */
  phone: string | null
  /** Doğrulama sırasında dönen kayıtlı müşteri adı (varsa) — formu önceden doldurmak için. */
  customer: CustomerName | null
  /** Token'ın bitiş zamanı (ms epoch). */
  expiresAt: number | null
  /** Oturumun süresi yeni dolduysa true — "oturumunuz sona erdi" mesajı göstermek için. */
  expired: boolean
  /** verifyCode yanıtını kaydeder. */
  login: (res: VerifyCodeResponse) => void
  /** Kayıtlı müşteri adını günceller (randevu alınınca ya da sunucudan okununca) ki sonraki formlar dolu gelsin. */
  setCustomer: (c: CustomerName) => void
  logout: () => void
  clearExpired: () => void
}

const CustomerAuthContext = createContext<CustomerAuthValue | null>(null)

function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const rawToken = useToken('customer')
  const [profile, setProfile] = useState<CustomerProfile>(readProfile)
  const [expired, setExpired] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const expiresAt = rawToken ? tokenExpiresAt(rawToken) : null
  const valid = !!rawToken && (expiresAt === null || expiresAt > now)

  // Süre dolunca token'ı temizle (zamanlayıcı + sekme geri geldiğinde kontrol).
  useEffect(() => {
    if (!rawToken || expiresAt === null) return
    const check = () => {
      const t = Date.now()
      setNow(t)
      if (t >= expiresAt) {
        tokenStore.clear('customer')
        setExpired(true)
      }
    }
    const remaining = expiresAt - Date.now()
    if (remaining <= 0) {
      check()
      return
    }
    // setTimeout 2^31 ms üstünde taşar; 30 dk için sorun yok ama güvenli olsun.
    const timer = window.setTimeout(check, Math.min(remaining + 250, 2_000_000_000))
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [rawToken, expiresAt])

  const login = useCallback((res: VerifyCodeResponse) => {
    const next: CustomerProfile = { phone: phoneFromToken(res.access_token), customer: res.customer }
    try {
      localStorage.setItem(CUSTOMER_PROFILE_KEY, JSON.stringify(next))
    } catch {
      /* yoksay */
    }
    setProfile(next)
    setExpired(false)
    setNow(Date.now())
    tokenStore.set('customer', res.access_token)
  }, [])

  const setCustomer = useCallback((c: CustomerName) => {
    setProfile((prev) => {
      if (prev.customer && prev.customer.name === c.name && prev.customer.surname === c.surname) return prev
      const next: CustomerProfile = { ...prev, customer: { name: c.name, surname: c.surname } }
      try {
        localStorage.setItem(CUSTOMER_PROFILE_KEY, JSON.stringify(next))
      } catch {
        /* yoksay */
      }
      return next
    })
  }, [])

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(CUSTOMER_PROFILE_KEY)
    } catch {
      /* yoksay */
    }
    setProfile({ phone: null, customer: null })
    tokenStore.clear('customer')
  }, [])

  const clearExpired = useCallback(() => setExpired(false), [])

  const value = useMemo<CustomerAuthValue>(
    () => ({
      isAuthenticated: valid,
      token: valid ? rawToken : null,
      phone: valid ? (profile.phone ?? (rawToken ? phoneFromToken(rawToken) : null)) : null,
      customer: profile.customer,
      expiresAt,
      expired,
      login,
      setCustomer,
      logout,
      clearExpired,
    }),
    [valid, rawToken, profile, expiresAt, expired, login, setCustomer, logout, clearExpired],
  )

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>
}

export function useCustomerAuth(): CustomerAuthValue {
  const ctx = useContext(CustomerAuthContext)
  if (!ctx) throw new Error('useCustomerAuth, AuthProviders içinde kullanılmalı')
  return ctx
}

/* ------------------------------------------------------------------ */

export function AuthProviders({ children }: { children: ReactNode }) {
  return (
    <StaffAuthProvider>
      <PlatformAuthProvider>
        <CustomerAuthProvider>{children}</CustomerAuthProvider>
      </PlatformAuthProvider>
    </StaffAuthProvider>
  )
}
