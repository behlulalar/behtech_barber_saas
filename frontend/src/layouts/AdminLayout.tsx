import { CalendarDays, ChartColumn, Clock, LayoutDashboard, LifeBuoy, Scissors, Settings, Store, UserCog, UserRound, Users, Wallet, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnnouncementBanner } from '../components/AnnouncementBanner'
import { WhatsappAlertBanner } from '../components/WhatsappAlertBanner'
import { Button } from '../components/ui/Button'
import { authApi } from '../lib/api'
import { useStaffAuth } from '../lib/auth'
import { fullName } from '../lib/format'
import { useDocumentTitle, useFavicon, useRouteLabel, useNoIndex } from '../lib/head'
import { useTenant } from '../lib/queries'
import { PanelShell, type NavItem } from './PanelShell'

const NAV: NavItem[] = [
  { to: '/panel', label: 'Genel Bakış', icon: LayoutDashboard, end: true, tab: true },
  { to: '/panel/randevular', label: 'Randevular', icon: CalendarDays, tab: true },
  { to: '/panel/musteriler', label: 'Müşteriler', icon: Users, tab: true },
  { to: '/panel/hizmetler', label: 'Hizmetler', icon: Scissors, tab: true, managerOnly: true },
  { to: '/panel/gelir', label: 'Gelir Raporu', icon: ChartColumn, managerOnly: true },
  { to: '/panel/ekip', label: 'Ekip', icon: UserRound },
  { to: '/panel/hesabim', label: 'Hesabım', icon: UserCog },
  { to: '/panel/calisma-saatleri', label: 'Çalışma Saatleri', icon: Clock, managerOnly: true },
  { to: '/panel/odeme-yontemleri', label: 'Ödeme Yöntemleri', icon: Wallet, managerOnly: true },
  { to: '/panel/whatsapp', label: 'WhatsApp Bağlantısı', icon: MessageCircle, managerOnly: true },
  { to: '/panel/ayarlar', label: 'Ayarlar', icon: Settings, managerOnly: true },
]

export const ROLE_LABELS = {
  super_admin: 'İşletme sahibi',
  technical_support: 'Yönetici',
  staff: 'Berber',
} as const

/** Destek modu bandı: platform yöneticisi işletme adına görüntülüyor/işlem yapıyor. */
function SupportBanner({ who, readOnly }: { who: string; readOnly: boolean }) {
  const { logout } = useStaffAuth()
  const navigate = useNavigate()
  const [ending, setEnding] = useState(false)

  async function end() {
    setEnding(true)
    try {
      await authApi.endImpersonation()
    } catch {
      /* oturum zaten düşmüş olabilir; yine de çıkış yap */
    }
    logout()
    // window.open ile açıldıysa sekmeyi kapatmayı dene; kapanmazsa giriş sayfasına git.
    if (window.opener) window.close()
    navigate('/panel/giris', { replace: true })
  }

  return (
    <div role="status" className="border-b border-danger/40 bg-[color-mix(in_srgb,var(--color-danger)_14%,var(--color-ink))] text-cream">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 md:px-8">
        <p className="flex min-w-0 items-start gap-2 text-sm leading-snug">
          <LifeBuoy className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <span className="min-w-0">
            <strong className="font-semibold">Destek modu</strong> — {who} olarak görüntülüyorsunuz
            {readOnly ? ' (yalnızca görüntüleme)' : ''}
          </span>
        </p>
        <div className="shrink-0 [&>button]:w-full sm:[&>button]:w-auto">
          <Button size="sm" variant="danger" loading={ending} onClick={end}>
            Destek oturumunu bitir
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Staff panel iskeleti. <RequireStaff> altında kullanılır. Sayfalar <Outlet/> içinde render edilir. */
export default function AdminLayout() {
  useNoIndex()
  const { me, logout, isManager } = useStaffAuth()
  const tenant = useTenant()
  const nav = isManager ? NAV : NAV.filter((n) => !n.managerOnly)
  useDocumentTitle(useRouteLabel(NAV), 'Panel', tenant.data?.business_name)
  useFavicon(tenant.data?.logo_image)
  const imp = me?.impersonated_by
  return (
    <PanelShell
      banner={imp ? <SupportBanner who={imp.name || imp.phone} readOnly={!!me?.read_only} /> : undefined}
      notice={
        <>
          <WhatsappAlertBanner />
          <AnnouncementBanner />
        </>
      }
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
