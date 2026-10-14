import { useQuery } from '@tanstack/react-query'
import { Building2, LayoutDashboard, Package, Receipt, Settings } from 'lucide-react'
import { useMatch } from 'react-router-dom'
import { platformApi } from '../lib/api'
import { usePlatformAuth } from '../lib/auth'
import { formatPhone } from '../lib/format'
import { PRODUCT_NAME, useDocumentTitle, useRouteLabel } from '../lib/head'
import { usePlatformManifest } from '../lib/push'
import { PanelShell, type NavItem } from './PanelShell'

const NAV: NavItem[] = [
  { to: '/platform', label: 'Genel Bakış', icon: LayoutDashboard, end: true, tab: true },
  { to: '/platform/odemeler', label: 'Ödemeler', icon: Receipt, tab: true },
  { to: '/platform/isletmeler', label: 'İşletmeler', icon: Building2, tab: true },
  { to: '/platform/paketler', label: 'Paketler', icon: Package },
  { to: '/platform/ayarlar', label: 'Ayarlar', icon: Settings },
]

/** Platform (SaaS sahibi) paneli iskeleti. <RequirePlatform> altında kullanılır. */
export default function PlatformLayout() {
  const { me, logout } = usePlatformAuth()
  usePlatformManifest()
  const detail = useMatch('/platform/isletmeler/:id')
  const tenants = useQuery({ queryKey: ['platform', 'tenants'], queryFn: platformApi.listTenants, enabled: !!detail })
  const detailName = detail ? tenants.data?.find((t) => String(t.id) === detail.params.id)?.name : undefined
  const label = useRouteLabel(NAV) ?? (detail ? 'İşletme' : undefined)
  useDocumentTitle(detailName ?? label, detailName ? 'İşletmeler' : undefined, 'Platform', PRODUCT_NAME)
  return (
    <PanelShell
      eyebrow="Platform"
      brand="BehTech Randevu"
      nav={NAV}
      user={{ name: 'Platform', subtitle: me ? formatPhone(me.phone) : '' }}
      onLogout={logout}
    />
  )
}
