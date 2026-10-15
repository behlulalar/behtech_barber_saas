import { CalendarDays, ChartColumn, Clock, LayoutDashboard, Scissors, Settings, Store, UserRound, Users, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useStaffAuth } from '../lib/auth'
import { fullName } from '../lib/format'
import { useDocumentTitle, useFavicon, useRouteLabel } from '../lib/head'
import { useTenant } from '../lib/queries'
import { PanelShell, type NavItem } from './PanelShell'

const NAV: NavItem[] = [
  { to: '/panel', label: 'Genel Bakış', icon: LayoutDashboard, end: true, tab: true },
  { to: '/panel/randevular', label: 'Randevular', icon: CalendarDays, tab: true },
  { to: '/panel/musteriler', label: 'Müşteriler', icon: Users, tab: true },
  { to: '/panel/hizmetler', label: 'Hizmetler', icon: Scissors, tab: true, managerOnly: true },
  { to: '/panel/gelir', label: 'Gelir Raporu', icon: ChartColumn, managerOnly: true },
  { to: '/panel/ekip', label: 'Ekip', icon: UserRound },
  { to: '/panel/calisma-saatleri', label: 'Çalışma Saatleri', icon: Clock, managerOnly: true },
  { to: '/panel/odeme-yontemleri', label: 'Ödeme Yöntemleri', icon: Wallet, managerOnly: true },
  { to: '/panel/ayarlar', label: 'Ayarlar', icon: Settings, managerOnly: true },
]

export const ROLE_LABELS = {
  super_admin: 'İşletme sahibi',
  technical_support: 'Yönetici',
  staff: 'Berber',
} as const

/** Staff panel iskeleti. <RequireStaff> altında kullanılır. Sayfalar <Outlet/> içinde render edilir. */
export default function AdminLayout() {
  const { me, logout, isManager } = useStaffAuth()
  const tenant = useTenant()
  const nav = isManager ? NAV : NAV.filter((n) => !n.managerOnly)
  useDocumentTitle(useRouteLabel(NAV), 'Panel', tenant.data?.business_name)
  useFavicon(tenant.data?.logo_image)
  return (
    <PanelShell
      eyebrow="Yönetim"
      brand={tenant.data?.business_name ?? 'Randevu Paneli'}
      nav={nav}
      user={{ name: me ? fullName(me) : '', subtitle: me ? ROLE_LABELS[me.role] : '' }}
      onLogout={logout}
      extra={
        <Link
          to="/"
          className="flex min-h-11 items-center gap-3 rounded-sm px-3 text-sm font-medium text-muted-strong transition-colors hover:bg-panel-raised hover:text-cream"
        >
          <Store className="size-[18px] text-muted" aria-hidden="true" />
          Siteyi görüntüle
        </Link>
      }
    />
  )
}
