// Panel sayfa parçalarını (lazy chunk) giriş sonrası boş zamanda önden indirir: sekme değiştirirken
// her ilk geçişte ağ turu beklenmesin. Parçalar yalnızca ısıtılır; sonuç kullanılmaz, hatalar yutulur.
const PLATFORM = [
  () => import('../pages/platform/DashboardPage'),
  () => import('../pages/platform/ApplicationsPage'),
  () => import('../pages/platform/TenantsPage'),
  () => import('../pages/platform/TenantDetailPage'),
  () => import('../pages/platform/PaymentsPage'),
  () => import('../pages/platform/PlansPage'),
  () => import('../pages/platform/SettingsPage'),
  () => import('../pages/platform/AdminsPage'),
  () => import('../pages/platform/AuditPage'),
  () => import('../pages/platform/AnnouncementsPage'),
  () => import('../pages/platform/SystemPage'),
]
const ADMIN = [
  () => import('../pages/admin/DashboardPage'),
  () => import('../pages/admin/AppointmentsPage'),
  () => import('../pages/admin/CustomersPage'),
  () => import('../pages/admin/ServicesPage'),
  () => import('../pages/admin/StaffPage'),
  () => import('../pages/admin/AccountPage'),
  () => import('../pages/admin/SchedulePage'),
  () => import('../pages/admin/PaymentMethodsPage'),
  () => import('../pages/admin/WhatsappPage'),
  () => import('../pages/admin/NotificationsPage'),
  () => import('../pages/admin/SettingsPage'),
  () => import('../pages/admin/RevenuePage'),
]

export function prefetchPanel(kind: 'platform' | 'admin'): () => void {
  const loaders = kind === 'platform' ? PLATFORM : ADMIN
  // Veri tasarrufu açıksa ya da bağlantı çok yavaşsa ısıtma yapma.
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  if (conn?.saveData || conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g') return () => {}
  let cancelled = false
  const run = async () => {
    for (const load of loaders) {
      if (cancelled) return
      try {
        await load()
      } catch {
        /* ağ hatası: sayfaya gidilince normal yüklenir */
      }
    }
  }
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void }
  if (w.requestIdleCallback) {
    const h = w.requestIdleCallback(() => void run(), { timeout: 3000 })
    return () => {
      cancelled = true
      w.cancelIdleCallback?.(h)
    }
  }
  const t = window.setTimeout(() => void run(), 1500)
  return () => {
    cancelled = true
    window.clearTimeout(t)
  }
}
