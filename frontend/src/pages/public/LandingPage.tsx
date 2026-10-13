import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CalendarCheck, Clock, MapPin, Smartphone, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { buttonStyles } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { publicApi } from '../../lib/api'
import { cn } from '../../lib/cn'
import { formatDuration, formatPrice, fullName } from '../../lib/format'
import { HERO_IMAGE } from '../../lib/placeholderImages'
import { useTenant } from '../../lib/queries'

const STEPS = [
  { icon: UserRound, title: 'Hizmet ve berber', text: 'İhtiyacınızı ve tercih ettiğiniz ustayı seçin.' },
  { icon: CalendarCheck, title: 'Gün ve saat', text: 'Yalnızca gerçekten boş olan saatler listelenir.' },
  { icon: Smartphone, title: 'Telefonla onay', text: 'Şifre yok; numaranıza gelen kodla onaylayın.' },
]

export default function LandingPage() {
  const tenant = useTenant()
  const services = useQuery({ queryKey: ['services'], queryFn: publicApi.getServices })
  const staff = useQuery({ queryKey: ['staff'], queryFn: publicApi.getStaff })
  const [bannerFailed, setBannerFailed] = useState(false)

  const name = tenant.data?.business_name
  const address = tenant.data?.business_address
  const logo = tenant.data?.logo_image
  const banner = tenant.data?.banner_image && !bannerFailed ? tenant.data.banner_image : HERO_IMAGE

  return (
    <div>
      {/* HERO */}
      <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pb-14 pt-8 md:grid-cols-[1.05fr_0.95fr] md:gap-14 md:px-10 md:pb-24 md:pt-16">
        <div className="min-w-0">
          {logo && (
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
          <div className="aspect-[4/5] w-full overflow-hidden rounded-md border border-line bg-surface md:aspect-[4/5]">
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
          </div>
          <div className="pointer-events-none absolute -bottom-3 -left-3 hidden size-24 rounded-md border border-copper/50 md:block" aria-hidden="true" />
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
        <div className="grid gap-10 md:grid-cols-[0.8fr_1.2fr] md:gap-16">
          <div className="min-w-0">
            <p className="eyebrow">Hizmetler</p>
            <h2 className="mt-4 font-display text-3xl font-medium leading-tight text-cream md:text-5xl">
              Fiyat listesi
            </h2>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              Tüm fiyatlar açık. Süreler yaklaşık değerlerdir.
            </p>
            <Link to="/randevu" className={buttonStyles({ variant: 'secondary', className: 'mt-6 hidden md:inline-flex' })}>
              Randevu al
            </Link>
          </div>

          <div className="min-w-0">
            {services.isLoading ? (
              <div className="space-y-4" role="status" aria-label="Hizmetler yükleniyor">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : services.isError ? (
              <p className="text-sm text-muted">Hizmetler şu an yüklenemedi.</p>
            ) : services.data && services.data.length > 0 ? (
              <ul className="divide-y divide-line border-y border-line">
                {services.data.map((s) => (
                  <li key={s.id} className="flex items-baseline justify-between gap-4 py-5">
                    <div className="min-w-0">
                      <h3 className="break-words font-display text-xl leading-snug text-cream">{s.name}</h3>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                        <Clock className="size-3.5" aria-hidden="true" />
                        {formatDuration(s.duration_min)}
                      </p>
                    </div>
                    <p className="shrink-0 font-display text-xl text-copper-bright">{formatPrice(s.price)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Hizmet listesi yakında burada olacak.</p>
            )}
          </div>
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
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {staff.data.map((p) => (
                <li key={p.id} className="min-w-0">
                  <Link
                    to="/randevu"
                    className={cn(
                      'group flex min-h-28 items-center gap-5 rounded-md border border-line bg-ink p-5 transition-colors',
                      'hover:border-copper/70 active:bg-surface-raised',
                    )}
                  >
                    <span
                      className="flex size-16 shrink-0 items-center justify-center rounded-full border border-line-strong font-display text-2xl text-copper-bright transition-colors group-hover:border-copper"
                      aria-hidden="true"
                    >
                      {`${p.name[0] ?? ''}${p.surname[0] ?? ''}`.toLocaleUpperCase('tr-TR')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-display text-xl leading-snug text-cream">{fullName(p)}</span>
                      <span className="mt-1 inline-flex items-center gap-1 text-sm text-muted transition-colors group-hover:text-copper-bright">
                        Randevu al
                        <ArrowRight className="size-3.5" aria-hidden="true" />
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
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
