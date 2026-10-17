import { useQuery } from '@tanstack/react-query'
import { ServiceVisual } from '../../components/booking/ServiceVisual'
import { ArrowRight, CalendarCheck, Clock, MapPin, Scissors, Smartphone, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ContactLinks } from '../../components/ContactLinks'
import { buttonStyles } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { publicApi } from '../../lib/api'
import { formatDuration, formatPrice, fullName, initials } from '../../lib/format'
import { useTenant } from '../../lib/queries'

const STEPS = [
  { icon: UserRound, title: 'Hizmet ve berber', text: 'İhtiyacınızı ve tercih ettiğiniz ustayı seçin.' },
  { icon: CalendarCheck, title: 'Gün ve saat', text: 'Yalnızca gerçekten boş olan saatler listelenir.' },
  { icon: Smartphone, title: 'Telefonla onay', text: 'Şifre yok; numaranıza gelen kodla onaylayın.' },
]

/** Berber direği şeritleri: kiracıya özgü görseller yokken kullanılan, palet tabanlı desen. */
const STRIPES = {
  backgroundImage:
    'repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-copper) 9%, transparent) 0 14px, transparent 14px 28px)',
} as const

/** Banner yokken hero: işletmenin kendi adı, logosu ve palet tabanlı desen. */
function BrandPanel({ name, logo }: { name?: string; logo?: string | null }) {
  return (
    <div className="relative flex size-full flex-col justify-between p-6 md:p-8" style={STRIPES}>
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,transparent,var(--color-surface)_75%)]"
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute inset-3 rounded-sm border border-copper/30" aria-hidden="true" />
      <div className="relative flex items-center justify-between">
        {logo ? (
          <img src={logo} alt="" width={64} height={64} className="size-16 rounded-full border border-copper/60 bg-ink object-cover" />
        ) : (
          <span className="flex size-12 items-center justify-center rounded-full border border-copper/60 bg-ink text-copper-bright">
            <Scissors className="size-5" aria-hidden="true" />
          </span>
        )}
        <span className="text-xs font-medium uppercase tracking-[0.25em] text-muted">Berber</span>
      </div>
      <div className="relative min-w-0">
        <p className="break-words font-display text-[2.4rem] font-medium leading-[1.02] tracking-tight text-cream md:text-5xl">
          {name ?? ' '}
        </p>
        <p className="mt-4 h-px w-12 bg-copper" aria-hidden="true" />
        <p className="mt-4 text-sm text-muted-strong">Randevunuz bir dakikada hazır.</p>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const tenant = useTenant()
  const services = useQuery({ queryKey: ['services'], queryFn: publicApi.getServices })
  const staff = useQuery({ queryKey: ['staff'], queryFn: publicApi.getStaff })
  const [bannerFailed, setBannerFailed] = useState(false)

  const name = tenant.data?.business_name
  const address = tenant.data?.business_address
  const logo = tenant.data?.logo_image
  const banner = tenant.data?.banner_image && !bannerFailed ? tenant.data.banner_image : null

  return (
    <div>
      {/* HERO */}
      <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pb-14 pt-8 md:grid-cols-[1.05fr_0.95fr] md:gap-14 md:px-10 md:pb-24 md:pt-16">
        <div className="min-w-0">
          {logo && banner && (
            <img
              src={logo}
              alt=""
              width={56}
              height={56}
              className="mb-6 size-14 rounded-full border border-line-strong object-cover"
            />
          )}
          <p className="eyebrow">{name ?? ' '}</p>
          <h1 className="mt-5 text-balance font-display text-[2.6rem] font-medium leading-[1.05] tracking-tight text-cream sm:text-6xl md:text-[4.25rem]">
            Düzgün bir tıraş,
            <br />
            <span className="italic text-copper-bright">doğru saatte.</span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted-strong md:text-lg">
            Sırada beklemek yok. Berberinizi ve saatinizi seçin, randevunuz bir dakikadan kısa sürede hazır olsun.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/randevu" className={buttonStyles({ size: 'lg', className: 'sm:min-w-52' })}>
              Randevu al
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link to="/randevularim" className={buttonStyles({ variant: 'secondary', size: 'lg' })}>
              Randevularım
            </Link>
          </div>
          {address && (
            <p className="mt-8 flex items-start gap-2.5 text-sm text-muted">
              <MapPin className="mt-0.5 size-4 shrink-0 text-copper" aria-hidden="true" />
              <span className="min-w-0 break-words">{address}</span>
            </p>
          )}
        </div>

        <div className="relative min-w-0">
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-md border border-line bg-surface">
            {banner ? (
              <>
                <img
                  src={banner}
                  alt={name ? `${name} dükkânı` : 'Berber dükkânı'}
                  width={800}
                  height={1000}
                  fetchPriority="high"
                  decoding="async"
                  onError={() => setBannerFailed(true)}
                  className="size-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/90 via-ink/50 to-transparent px-6 pb-6 pt-24">
                  {name && <p className="break-words font-display text-2xl leading-tight text-cream">{name}</p>}
                </div>
              </>
            ) : (
              <BrandPanel name={name} logo={logo} />
            )}
          </div>
        </div>
      </section>

      {/* NASIL */}
      <section className="border-y border-line bg-surface" aria-label="Nasıl çalışır">
        <ol className="mx-auto grid w-full max-w-6xl gap-px px-5 py-8 md:grid-cols-3 md:gap-10 md:px-10 md:py-12">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex min-w-0 items-start gap-4 py-3 md:py-0">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line-strong text-copper">
                <s.icon className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="font-display text-lg leading-snug text-cream">
                  <span className="mr-2 text-copper-bright">{i + 1}.</span>
                  {s.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* HİZMETLER */}
      <section id="hizmetler" className="mx-auto w-full max-w-6xl px-5 py-16 md:px-10 md:py-24">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="eyebrow">Hizmetler</p>
            <h2 className="mt-4 font-display text-3xl font-medium leading-tight text-cream md:text-5xl">Fiyat listesi</h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">Tüm fiyatlar açık. Süreler yaklaşık değerlerdir.</p>
          </div>
          <Link to="/randevu" className={buttonStyles({ variant: 'secondary', className: 'hidden md:inline-flex' })}>
            Randevu al
          </Link>
        </div>

        <div className="mt-10 min-w-0">
          {services.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Hizmetler yükleniyor">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-64 w-full" />
              ))}
            </div>
          ) : services.isError ? (
            <p className="text-sm text-muted">Hizmetler şu an yüklenemedi.</p>
          ) : services.data && services.data.length > 0 ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {services.data.map((s) => (
                <li key={s.id} className="flex flex-col overflow-hidden rounded-md border border-line bg-surface-raised">
                  <ServiceVisual id={s.id} name={s.name} image={s.image} className="aspect-[16/10] w-full" />
                  <div className="flex flex-1 items-end justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <h3 className="break-words font-display text-xl leading-snug text-cream">{s.name}</h3>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                        <Clock className="size-3.5" aria-hidden="true" />
                        {formatDuration(s.duration_min)}
                      </p>
                    </div>
                    <p className="shrink-0 font-display text-xl text-copper-bright">{formatPrice(s.price)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Hizmet listesi yakında burada olacak.</p>
          )}
          <Link to="/randevu" className={buttonStyles({ variant: 'secondary', className: 'mt-6 md:hidden' })}>
            Randevu al
          </Link>
        </div>
      </section>

      {/* EKİP */}
      <section id="ekip" className="border-t border-line bg-surface">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 md:px-10 md:py-24">
          <p className="eyebrow">Ekibimiz</p>
          <h2 className="mt-4 font-display text-3xl font-medium leading-tight text-cream md:text-5xl">
            Makasın başındaki ustalar
          </h2>

          {staff.isLoading ? (
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Ekip yükleniyor">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-md" />
              ))}
            </div>
          ) : staff.data && staff.data.length > 0 ? (
            <ul className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6">
              {staff.data.map((p) => {
                const offered = (services.data ?? []).filter((sv) => p.service_ids.includes(sv.id))
                return (
                  <li key={p.id} className="min-w-0">
                    <Link
                      to="/randevu"
                      className="group block h-full overflow-hidden rounded-md border border-line bg-ink transition-colors hover:border-copper/70 active:bg-surface-raised"
                    >
                      <div className="relative aspect-[4/5] w-full overflow-hidden bg-surface-raised">
                        {p.photo_image ? (
                          <img
                            src={p.photo_image}
                            alt={fullName(p)}
                            width={400}
                            height={500}
                            loading="lazy"
                            decoding="async"
                            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                          />
                        ) : (
                          <div className="flex size-full items-center justify-center" style={STRIPES} aria-hidden="true">
                            <span className="font-display text-5xl text-copper-bright md:text-6xl">{initials(fullName(p))}</span>
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <p className="break-words font-display text-lg leading-snug text-cream md:text-xl">{fullName(p)}</p>
                        {offered.length > 0 && (
                          <p className="mt-1 line-clamp-2 break-words text-xs leading-relaxed text-muted">
                            {offered.slice(0, 3).map((sv) => sv.name).join(' · ')}
                            {offered.length > 3 ? ` +${offered.length - 3}` : ''}
                          </p>
                        )}
                        <span className="mt-3 inline-flex min-h-6 items-center gap-1 text-sm text-copper transition-colors group-hover:text-copper-bright">
                          Randevu al
                          <ArrowRight className="size-3.5" aria-hidden="true" />
                        </span>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      </section>

      {/* ZİYARET */}
      <section className="mx-auto w-full max-w-6xl px-5 py-16 md:px-10 md:py-24">
        <div className="rounded-md border border-line-strong p-7 md:flex md:items-center md:justify-between md:gap-10 md:p-12">
          <div className="min-w-0">
            <h2 className="font-display text-3xl font-medium leading-tight text-cream md:text-4xl">Sizi bekliyoruz</h2>
            {address && (
              <p className="mt-3 flex items-start gap-2.5 text-muted-strong">
                <MapPin className="mt-1 size-4 shrink-0 text-copper" aria-hidden="true" />
                <span className="min-w-0 break-words">{address}</span>
              </p>
            )}
            <ContactLinks info={tenant.data} variant="list" className="mt-2" />
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row md:mt-0 md:shrink-0">
            {address && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonStyles({ variant: 'secondary', size: 'lg' })}
              >
                Yol tarifi
              </a>
            )}
            <Link to="/randevu" className={buttonStyles({ size: 'lg' })}>
              Randevu al
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
