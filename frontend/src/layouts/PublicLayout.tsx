import { ArrowLeft, CalendarCheck, LogIn, LogOut, Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ContactLinks } from '../components/ContactLinks'
import { LegalLink } from '../components/LegalModal'
import { buttonStyles } from '../components/ui/Button'
import { useScrollLock } from '../components/ui/useDialog'
import { useCustomerAuth } from '../lib/auth'
import { cn } from '../lib/cn'
import { formatPhone } from '../lib/format'
import { PRODUCT_NAME, useDocumentTitle, useFavicon, useRouteLabel } from '../lib/head'
import { useTenant } from '../lib/queries'
import { DEMO_SLUG, productSiteUrl } from '../lib/site'

const LINKS = [
  { to: '/#hizmetler', label: 'Hizmetler' },
  { to: '/#ekip', label: 'Ekibimiz' },
]

const PAGE_TITLES = [
  { to: '/randevu', label: 'Randevu al' },
  { to: '/randevularim', label: 'Randevularım' },
]

/** Müşteri tarafı iskeleti: işletme adıyla header, mobil menü, footer. */
export default function PublicLayout() {
  const tenant = useTenant()
  const { isAuthenticated, phone, logout } = useCustomerAuth()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const name = tenant.data?.business_name

  // Rota değişince menüyü kapat, hash varsa ona kaydır, yoksa en üste dön.
  useEffect(() => {
    setOpen(false)
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1))
      if (el) {
        el.scrollIntoView()
        return
      }
    }
    window.scrollTo(0, 0)
  }, [location.pathname, location.hash])

  const pageLabel = useRouteLabel(PAGE_TITLES)
  useDocumentTitle(pageLabel, name ?? (tenant.isLoading ? null : PRODUCT_NAME))
  useFavicon(tenant.data?.logo_image)

  // Menü açıkken arka plan kaydırmasını kilitle.
  useScrollLock(open)

  return (
    <div className="flex min-h-svh flex-col bg-ink">
      {tenant.data?.slug === DEMO_SLUG && (
        <div className="border-b border-copper/40 bg-copper/10">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 px-5 md:px-10">
            <p className="py-2 text-sm text-muted-strong">Bu bir demo sitesidir.</p>
            <a href={productSiteUrl()} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-copper-bright hover:underline">
              <ArrowLeft className="size-4" aria-hidden="true" /> BehTech Randevu'ya geri dön
            </a>
          </div>
        </div>
      )}
      <header className="pt-safe sticky top-0 z-40 border-b border-line bg-ink/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 md:h-[72px] md:px-10">
          <Link to="/" className="flex min-h-11 min-w-0 items-center leading-none">
            <span className="block truncate font-display text-xl font-semibold tracking-wide text-cream">
              {name ?? ' '}
            </span>
          </Link>

          <nav aria-label="Ana menü" className="hidden items-center gap-8 md:flex">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} className="inline-flex min-h-11 items-center text-sm font-medium text-muted-strong transition-colors hover:text-cream">
                {l.label}
              </NavLink>
            ))}
            {/* Müşteri girişi: daha önce randevu almış biri başka cihazdan telefon + kodla girer */}
            <Link to="/randevularim" className={buttonStyles({ size: 'sm', variant: 'secondary' })}>
              {isAuthenticated ? <CalendarCheck className="size-4" aria-hidden="true" /> : <LogIn className="size-4" aria-hidden="true" />}
              {isAuthenticated ? 'Randevularım' : 'Giriş yap'}
            </Link>
            <Link to="/randevu" className={buttonStyles({ size: 'sm' })}>
              Randevu Al
            </Link>
          </nav>

          <button
            type="button"
            className="-mr-2 inline-flex size-11 items-center justify-center rounded-sm text-cream active:bg-cream/10 md:hidden"
            aria-label={open ? 'Menüyü kapat' : 'Menüyü aç'}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>

        {open && (
          <div
            id="mobile-menu"
            className="absolute inset-x-0 top-full flex max-h-[calc(100dvh-4rem)] animate-fade-in flex-col overflow-y-auto border-b border-line bg-ink px-5 pb-6 pt-2 md:hidden"
          >
            {LINKS.map((l) => (
              <Link key={l.to} to={l.to} className="flex min-h-14 items-center border-b border-line font-display text-xl text-cream">
                {l.label}
              </Link>
            ))}
            <Link to="/randevularim" className={cn(buttonStyles({ size: 'lg', variant: 'secondary', fullWidth: true }), 'mt-5')}>
              {isAuthenticated ? <CalendarCheck className="size-5" aria-hidden="true" /> : <LogIn className="size-5" aria-hidden="true" />}
              {isAuthenticated ? 'Randevularım' : 'Giriş yap'}
            </Link>
            <Link to="/randevu" className={cn(buttonStyles({ size: 'lg', fullWidth: true }), 'mt-3')}>
              Randevu Al
            </Link>
            {isAuthenticated && (
              <div className="mt-4 flex flex-col items-center gap-1 text-center text-xs text-muted">
                {phone && <p>{formatPhone(phone)} ile giriş yapıldı</p>}
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    logout()
                  }}
                  className="inline-flex min-h-11 items-center gap-1.5 text-muted-strong underline-offset-4 hover:underline">
                  <LogOut className="size-3.5" aria-hidden="true" />
                  Çıkış yap
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      <main className="min-w-0 flex-1">
        <Outlet />
      </main>

      <footer className="pb-safe border-t border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 md:flex-row md:items-end md:justify-between md:px-10">
          <div className="min-w-0">
            <p className="break-words font-display text-lg font-semibold text-cream">{name ?? ''}</p>
            {tenant.data?.business_address && <p className="mt-1.5 break-words text-sm text-muted">{tenant.data.business_address}</p>}
            <ContactLinks info={tenant.data} className="mt-4" />
          </div>
          <div className="flex flex-col gap-2 text-sm text-muted md:items-end">
            <LegalLink slug="aydinlatma" className="inline-flex min-h-11 items-center hover:text-cream md:pointer-fine:min-h-0">
              Aydınlatma Metni
            </LegalLink>
            <Link to="/panel/giris" className="inline-flex min-h-11 items-center hover:text-cream md:pointer-fine:min-h-0">
              Personel girişi
            </Link>
            <p>© {new Date().getFullYear()} · behtechlabs.com altyapısıyla</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
