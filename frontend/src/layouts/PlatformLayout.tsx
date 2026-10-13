import { Building2, LayoutDashboard } from 'lucide-react'
import { usePlatformAuth } from '../lib/auth'
import { formatPhone } from '../lib/format'
import { PanelShell, type NavItem } from './PanelShell'

const NAV: NavItem[] = [
  { to: '/platform', label: 'Genel Bakış', icon: LayoutDashboard, end: true, tab: true },
  { to: '/platform/isletmeler', label: 'İşletmeler', icon: Building2, tab: true },
]

/** Platform (SaaS sahibi) paneli iskeleti. <RequirePlatform> altında kullanılır. */
export default function PlatformLayout() {
  const { me, logout } = usePlatformAuth()
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
