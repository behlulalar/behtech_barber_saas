import { LogOut, Menu } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { Avatar } from '../components/ui/Avatar'
import { Drawer } from '../components/ui/Drawer'
import { cn } from '../lib/cn'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  /** Mobil alt çubukta doğrudan gösterilsin mi (en fazla 4). Diğerleri "Menü" çekmecesinde. */
  tab?: boolean
  /** Yalnızca yönetici (işletme sahibi) görür; personelin menüsünde yer almaz. */
  managerOnly?: boolean
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
}

function NavList({ nav, onNavigate, variant }: { nav: NavItem[]; onNavigate?: () => void; variant: 'sidebar' | 'drawer' }) {
  return (
    <nav aria-label="Ana menü" className="flex flex-col gap-0.5 px-3">
      {nav.map((item) => (
        <NavLink
          key={item.to}
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
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function UserBlock({ user, onLogout }: { user: PanelShellProps['user']; onLogout: () => void }) {
  return (
    <div className="border-t border-panel-line p-3">
      <div className="flex items-center gap-3 px-2 py-2">
        <Avatar name={user.name} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-cream">{user.name}</p>
          <p className="truncate text-xs text-muted">{user.subtitle}</p>
        </div>
      </div>
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
export function PanelShell({ eyebrow, brand, nav, user, onLogout, extra }: PanelShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()
  const tabs = nav.filter((n) => n.tab).slice(0, 4)
  const current = nav.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)))

  return (
    <div className="min-h-svh bg-ink lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      {/* Masaüstü kenar çubuğu */}
      <aside className="sticky top-0 hidden h-svh flex-col border-r border-panel-line bg-panel lg:flex">
        <div className="px-6 pb-6 pt-7">
          <p className="eyebrow">{eyebrow}</p>
          <p className="mt-3 break-words font-display text-xl font-medium leading-tight text-cream">{brand}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavList nav={nav} variant="sidebar" />
          {extra && <div className="mt-4 px-3">{extra}</div>}
        </div>
        <UserBlock user={user} onLogout={onLogout} />
      </aside>

      <div className="min-w-0">
        {/* Mobil üst çubuk */}
        <header className="pt-safe sticky top-0 z-30 border-b border-panel-line bg-panel/95 backdrop-blur-sm lg:hidden">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <div className="min-w-0">
              <p className="eyebrow">{eyebrow}</p>
              <p className="mt-1 truncate font-display text-base font-medium leading-none text-cream">{current?.label ?? brand}</p>
            </div>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Menüyü aç"
              className="-mr-2 inline-flex size-11 items-center justify-center rounded-sm text-muted-strong active:bg-cream/10"
            >
              <Menu className="size-6" />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full min-w-0 max-w-6xl px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-6 md:px-8 md:pt-8 lg:pb-14">
          <Outlet />
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
                <item.icon className="size-5" aria-hidden="true" />
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
          <UserBlock user={user} onLogout={onLogout} />
        </div>
      </Drawer>
    </div>
  )
}
