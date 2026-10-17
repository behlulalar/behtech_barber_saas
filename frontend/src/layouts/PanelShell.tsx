import { LogOut, Menu } from 'lucide-react'
import { Fragment, Suspense, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { Avatar } from '../components/ui/Avatar'
import { Spinner } from '../components/ui/Spinner'
import { InstallButton } from '../components/InstallButton'
import { Drawer } from '../components/ui/Drawer'
import { cn } from '../lib/cn'
import { useApplyTextSize } from '../lib/textSize'
import { ThemeToggle } from '../lib/theme'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  /** Mobil alt çubukta doğrudan gösterilsin mi (en fazla 4). Diğerleri "Menü" çekmecesinde. */
  tab?: boolean
  /** Yalnızca yönetici (işletme sahibi) görür; personelin menüsünde yer almaz. */
  managerOnly?: boolean
  /** Menü öğesinin yanında küçük sayı rozeti (0/boş ise gösterilmez). */
  badge?: number
  /** Menüde bu öğeden önce küçük bir bölüm başlığı gösterilir (aynı başlıklı öğeler art arda gelmeli). */
  group?: string
  /** Menüde/çekmecede gösterilmez ama sayfa başlığı ve yönlendirme için tanımlı kalır. */
  hidden?: boolean
}

interface PanelShellProps {
  /** Üstteki küçük etiket: "Yönetim" / "Platform" */
  eyebrow: string
  brand: string
  nav: NavItem[]
  user: { name: string; subtitle: string }
  onLogout: () => void
  /** Kenar çubuğunun / çekmecenin altına ek bağlantılar */
  extra?: ReactNode
  /** Sayfanın en üstünde yapışık duran bant (ör. destek modu). Yüksekliği kenar çubuğu/üst çubuğa yansıtılır. */
  banner?: ReactNode
  /** İçeriğin en üstünde (yapışık olmayan) duyuru alanı. */
  notice?: ReactNode
  /** "Uygulamayı yükle" düğmesini göster (işletme paneli). */
  installable?: boolean
  /** İçerik genişliği: tablolu sayfalar için 'wide'. */
  width?: 'default' | 'wide'
}

function NavList({ nav, onNavigate, variant }: { nav: NavItem[]; onNavigate?: () => void; variant: 'sidebar' | 'drawer' }) {
  return (
    <nav aria-label="Ana menü" className="flex flex-col gap-0.5 px-3">
      {nav.filter((n) => !n.hidden).map((item, i, list) => (
        <Fragment key={item.to}>
          {item.group && item.group !== list[i - 1]?.group && (
            <p className="px-3 pb-1 pt-4 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted">{item.group}</p>
          )}
        <NavLink
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'group flex min-h-11 items-center gap-3 rounded-sm px-3 text-sm font-medium transition-colors',
              variant === 'drawer' && 'min-h-12 text-base',
              isActive ? 'bg-panel-hover text-cream' : 'text-muted-strong hover:bg-panel-raised hover:text-cream',
            )
          }
        >
          {({ isActive }) => (
            <>
              <item.icon className={cn('size-[18px] shrink-0', isActive ? 'text-copper-bright' : 'text-muted group-hover:text-muted-strong')} aria-hidden="true" />
              <span className="min-w-0 truncate">{item.label}</span>
              {!!item.badge && (
                <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-copper px-1.5 text-xs font-semibold leading-5 text-on-accent tabular-nums">
                  <span className="sr-only">Bekleyen: </span>
                  {item.badge}
                </span>
              )}
            </>
          )}
        </NavLink>
        </Fragment>
      ))}
    </nav>
  )
}

function UserBlock({ user, onLogout, installable }: { user: PanelShellProps['user']; onLogout: () => void; installable?: boolean }) {
  return (
    <div className="border-t border-panel-line p-3">
      <div className="flex items-center gap-3 px-2 py-2">
        <Avatar name={user.name} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-cream">{user.name}</p>
          <p className="truncate text-xs text-muted">{user.subtitle}</p>
        </div>
      </div>
      {installable && <InstallButton />}
      <button
        type="button"
        onClick={onLogout}
        className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-sm px-3 text-sm font-medium text-muted-strong transition-colors hover:bg-panel-raised hover:text-cream"
      >
        <LogOut className="size-[18px] text-muted" aria-hidden="true" />
        Çıkış yap
      </button>
    </div>
  )
}

/** Admin ve Platform layout'larının ortak iskeleti: masaüstü kenar çubuğu, mobil üst çubuk + alt sekme çubuğu + çekmece. */
export function PanelShell({ eyebrow, brand, nav, user, onLogout, extra, banner, notice, installable, width = 'default' }: PanelShellProps) {
  useApplyTextSize()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const bannerRef = useRef<HTMLDivElement>(null)
  const [bannerH, setBannerH] = useState(0)
  // Bant mobilde satır kırabilir; yapışık başlık/kenar çubuğu bandın altından başlasın diye yüksekliği ölçeriz.
  useLayoutEffect(() => {
    const el = bannerRef.current
    if (!el) {
      setBannerH(0)
      return
    }
    const measure = () => setBannerH(el.getBoundingClientRect().height)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [banner])
  const location = useLocation()
  const tabs = nav.filter((n) => n.tab).slice(0, 4)
  const current = nav.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)))

  return (
    <div className="min-h-svh bg-ink" style={{ '--banner-h': `${bannerH}px` } as CSSProperties}>
      {banner && (
        <div ref={bannerRef} className="pt-safe sticky top-0 z-40">
          {banner}
        </div>
      )}
      <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      {/* Masaüstü kenar çubuğu */}
      <aside className="sticky top-[var(--banner-h)] hidden h-[calc(100svh-var(--banner-h))] flex-col border-r border-panel-line bg-panel lg:flex">
        <div className="px-6 pb-6 pt-7">
          <p className="eyebrow">{eyebrow}</p>
          <p className="mt-3 break-words font-display text-xl font-medium leading-tight text-cream">{brand}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavList nav={nav} variant="sidebar" />
          {extra && <div className="mt-4 px-3">{extra}</div>}
        </div>
        <UserBlock user={user} onLogout={onLogout} installable={installable} />
      </aside>

      <div className="min-w-0">
        {/* Mobil üst çubuk */}
        <header className={cn(!banner && 'pt-safe', 'sticky top-[var(--banner-h)] z-30 border-b border-panel-line bg-panel/95 backdrop-blur-sm lg:hidden')}>
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <div className="min-w-0">
              <p className="eyebrow">{eyebrow}</p>
              <p className="mt-1 truncate font-display text-base font-medium leading-none text-cream">{current?.label ?? brand}</p>
            </div>
            <div className="-mr-2 flex items-center">
              <ThemeToggle className="active:bg-cream/10" />
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Menüyü aç"
                className="inline-flex size-11 items-center justify-center rounded-sm text-muted-strong active:bg-cream/10"
              >
                <Menu className="size-6" />
              </button>
            </div>
          </div>
        </header>

        {/* Masaüstü: sağ üstte tema düğmesi (mobilde üst çubukta) */}
        <div className="hidden justify-end px-8 pt-3 lg:flex">
          <ThemeToggle className="hover:bg-panel-raised" />
        </div>

        <main className={cn('mx-auto w-full min-w-0 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-6 md:px-8 md:pt-8 lg:pb-14 lg:pt-2', width === 'wide' ? 'max-w-[88rem]' : 'max-w-6xl')}>
          {notice}
          {/* Sayfa parçası inerken yalnızca içerik alanı bekler; menü ve üst çubuk yerinde kalır. */}
          <Suspense fallback={<div className="flex min-h-[40svh] items-center justify-center"><Spinner size="lg" /></div>}>
            <Outlet />
          </Suspense>
        </main>

        {/* Mobil alt sekme çubuğu */}
        <nav
          aria-label="Hızlı menü"
          className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-panel-line bg-panel/95 backdrop-blur-sm lg:hidden"
        >
          <div className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
            {tabs.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors active:bg-cream/5',
                    isActive ? 'text-copper-bright' : 'text-muted',
                  )
                }
              >
                <span className="relative">
                  <item.icon className="size-5" aria-hidden="true" />
                  {!!item.badge && (
                    <span className="absolute -right-2.5 -top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-copper px-1 text-[0.65rem] font-semibold leading-4 text-on-accent tabular-nums">
                      {item.badge}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate px-1">{item.label}</span>
              </NavLink>
            ))}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium text-muted active:bg-cream/5"
            >
              <Menu className="size-5" aria-hidden="true" />
              Menü
            </button>
          </div>
        </nav>
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} label="Menü">
        <div className="flex h-full flex-col">
          <div className="px-6 pb-5 pt-2">
            <p className="eyebrow">{eyebrow}</p>
            <p className="mt-3 break-words font-display text-xl font-medium leading-tight text-cream">{brand}</p>
          </div>
          <div className="flex-1">
            <NavList nav={nav} variant="drawer" onNavigate={() => setDrawerOpen(false)} />
            {extra && <div className="mt-4 px-3">{extra}</div>}
          </div>
          <UserBlock user={user} onLogout={onLogout} installable={installable} />
        </div>
      </Drawer>
      </div>
    </div>
  )
}
