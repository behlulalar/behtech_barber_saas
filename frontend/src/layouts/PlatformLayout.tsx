import { useQuery } from '@tanstack/react-query'
import { Building2, HeartPulse, Megaphone, LayoutDashboard, Package, Receipt, ScrollText, Settings, ShieldCheck, UserPlus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useMatch } from 'react-router-dom'
import { MFA_SETUP_EVENT, platformApi } from '../lib/api'
import { usePlatformAuth } from '../lib/auth'
import { formatPhone } from '../lib/format'
import { PRODUCT_NAME, useDocumentTitle, useRouteLabel, useNoIndex } from '../lib/head'
import { usePlatformManifest } from '../lib/push'
import { TwoFactorSetup } from '../pages/platform/TwoFactor'
import { PanelShell, type NavItem } from './PanelShell'

const BASE_NAV: NavItem[] = [
  { to: '/platform', label: 'Genel Bakış', icon: LayoutDashboard, end: true, tab: true },
  { to: '/platform/odemeler', label: 'Ödemeler', icon: Receipt, tab: true },
  { to: '/platform/basvurular', label: 'Başvurular', icon: UserPlus, tab: true },
  { to: '/platform/isletmeler', label: 'İşletmeler', icon: Building2, tab: true },
  { to: '/platform/paketler', label: 'Paketler', icon: Package },
  { to: '/platform/duyurular', label: 'Duyurular', icon: Megaphone },
  { to: '/platform/ayarlar', label: 'Ayarlar', icon: Settings },
  { to: '/platform/yoneticiler', label: 'Yöneticiler', icon: ShieldCheck },
  { to: '/platform/denetim', label: 'Denetim kaydı', icon: ScrollText },
  { to: '/platform/sistem', label: 'Sistem', icon: HeartPulse },
]

/** Zorunlu 2FA kurulumu: menüsüz, kapatılamaz tam sayfa. */
function MfaSetupGate({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-ink px-4 py-8">
      <div className="w-full max-w-md rounded-md border border-line bg-panel p-5 md:p-6">
        <h1 className="font-display text-2xl font-medium text-cream">Güvenliğiniz için iki aşamalı doğrulamayı kurun</h1>
        <p className="mb-5 mt-2 text-sm text-muted-strong">Platform paneline devam etmek için bu adım zorunludur.</p>
        <TwoFactorSetup onDone={() => undefined} />
        <button type="button" onClick={onLogout} className="mt-4 min-h-11 text-sm text-muted underline hover:text-cream">
          Çıkış yap
        </button>
      </div>
    </div>
  )
}

/** Platform (SaaS sahibi) paneli iskeleti. <RequirePlatform> altında kullanılır. */
export default function PlatformLayout() {
  useNoIndex()
  const { me, logout, token } = usePlatformAuth()
  // Kısıtlı oturumda herhangi bir istek 403 "kurulum gerekli" dönerse (token'a bağlı) kapı açılır.
  const [forcedFor, setForcedFor] = useState<string | null>(null)
  useEffect(() => {
    const on = () => setForcedFor(token)
    window.addEventListener(MFA_SETUP_EVENT, on)
    return () => window.removeEventListener(MFA_SETUP_EVENT, on)
  }, [token])
  const mfaGate = !!me?.mfa_setup_required || (forcedFor !== null && forcedFor === token)
  // Onay bekleyen kayıt başvurusu sayısı (limit=1 ile yalnızca total okunur).
  const pendingQ = useQuery({
    queryKey: ['platform', 'tenants', 'pending-count'],
    queryFn: () => platformApi.listTenants({ status: 'pending', limit: 1 }),
    refetchInterval: 60_000,
    enabled: !mfaGate,
  })
  const pending = pendingQ.data?.total ?? 0
  const NAV = useMemo(() => BASE_NAV.map((n) => (n.to === '/platform/basvurular' ? { ...n, badge: pending } : n)), [pending])
  usePlatformManifest()
  const detail = useMatch('/platform/isletmeler/:id')
  const tenants = useQuery({ queryKey: ['platform', 'tenant', detail?.params.id], queryFn: () => platformApi.getTenant(Number(detail!.params.id)), enabled: !!detail })
  const detailName = detail ? tenants.data?.name : undefined
  const label = useRouteLabel(NAV) ?? (detail ? 'İşletme' : undefined)
  useDocumentTitle(detailName ?? label, detailName ? 'İşletmeler' : undefined, 'Platform', PRODUCT_NAME)
  if (mfaGate) return <MfaSetupGate onLogout={logout} />
  return (
    <PanelShell
      width="wide"
      eyebrow="Platform"
      brand="BehTech Randevu"
      nav={NAV}
      user={{ name: me?.name || 'Platform', subtitle: me ? formatPhone(me.phone) : '' }}
      onLogout={logout}
    />
  )
}
