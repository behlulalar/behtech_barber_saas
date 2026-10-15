import { useQuery } from '@tanstack/react-query'
import { Building2, HeartPulse, LayoutDashboard, Package, Receipt, ScrollText, Settings, ShieldCheck } from 'lucide-react'
import { useMemo } from 'react'
import { useMatch } from 'react-router-dom'
import { platformApi } from '../lib/api'
import { usePlatformAuth } from '../lib/auth'
import { formatPhone } from '../lib/format'
import { PRODUCT_NAME, useDocumentTitle, useRouteLabel } from '../lib/head'
import { usePlatformManifest } from '../lib/push'
import { PanelShell, type NavItem } from './PanelShell'

const BASE_NAV: NavItem[] = [
  { to: '/platform', label: 'Genel Bakış', icon: LayoutDashboard, end: true, tab: true },
  { to: '/platform/odemeler', label: 'Ödemeler', icon: Receipt, tab: true },
  { to: '/platform/isletmeler', label: 'İşletmeler', icon: Building2, tab: true },
  { to: '/platform/paketler', label: 'Paketler', icon: Package },
  { to: '/platform/ayarlar', label: 'Ayarlar', icon: Settings },
  { to: '/platform/yoneticiler', label: 'Yöneticiler', icon: ShieldCheck },
  { to: '/platform/denetim', label: 'Denetim kaydı', icon: ScrollText },
  { to: '/platform/sistem', label: 'Sistem', icon: HeartPulse },
]

/** Platform (SaaS sahibi) paneli iskeleti. <RequirePlatform> altında kullanılır. */
export default function PlatformLayout() {
  const { me, logout } = usePlatformAuth()
  // Onay bekleyen kayıt başvurusu sayısı (limit=1 ile yalnızca total okunur).
  const pendingQ = useQuery({
    queryKey: ['platform', 'tenants', 'pending-count'],
    queryFn: () => platformApi.listTenants({ status: 'pending', limit: 1 }),
    refetchInterval: 60_000,
  })
  const pending = pendingQ.data?.total ?? 0
  const NAV = useMemo(() => BASE_NAV.map((n) => (n.to === '/platform/isletmeler' ? { ...n, badge: pending } : n)), [pending])
  usePlatformManifest()
  const detail = useMatch('/platform/isletmeler/:id')
  const tenants = useQuery({ queryKey: ['platform', 'tenant', detail?.params.id], queryFn: () => platformApi.getTenant(Number(detail!.params.id)), enabled: !!detail })
  const detailName = detail ? tenants.data?.name : undefined
  const label = useRouteLabel(NAV) ?? (detail ? 'İşletme' : undefined)
  useDocumentTitle(detailName ?? label, detailName ? 'İşletmeler' : undefined, 'Platform', PRODUCT_NAME)
  return (
    <PanelShell
      eyebrow="Platform"
      brand="BehTech Randevu"
      nav={NAV}
      user={{ name: me?.name || 'Platform', subtitle: me ? formatPhone(me.phone) : '' }}
      onLogout={logout}
    />
  )
}
