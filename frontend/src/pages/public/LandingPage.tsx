import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { publicApi } from '../../lib/api'
import { formatDuration, formatPrice } from '../../lib/format'
import { useTenant } from '../../lib/queries'
import { HERO_IMAGE, staffImageFor } from '../../lib/placeholderImages'

function ServiceIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export default function LandingPage() {
  const tenant = useTenant()
  const staffQuery = useQuery({ queryKey: ['staff'], queryFn: publicApi.getStaff })
  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: publicApi.getServices })

  return (
    <div className="text-cream">
      {/* HERO */}
      <section className="flex flex-col items-center gap-16 px-5 py-16 md:flex-row md:px-10 md:py-24">
        <div className="flex min-w-0 flex-1 flex-col gap-7">
          <span className="text-xs font-semibold tracking-[4px] text-copper">
            {(tenant.data?.business_name ?? '').toLocaleUpperCase('tr-TR')}
          </span>
          <h1 className="font-display text-5xl font-medium leading-[1.08] tracking-tight md:text-6xl">
            Usta ellerde,
            <br />
            randevulu <span className="font-serif italic text-copper">zanaat.</span>
          </h1>
          <p className="max-w-md text-[17px] leading-relaxed text-muted-strong">
            Saç, sakal ve cilt bakımınızı güvendiğiniz ustadan, size uygun saatte alın.
            Tüm randevu süreci üç dakikadan kısa sürer.
          </p>
          <div className="mt-3 flex flex-wrap gap-4">
            <Link
              to="/randevu"
              className="rounded-sm bg-copper px-8 py-4 text-sm font-semibold text-ink hover:bg-copper-bright"
            >
              Randevu Al
            </Link>
            <a
              href="#hizmetler"
              className="rounded-sm border border-line-strong px-8 py-4 text-sm font-semibold text-cream hover:border-copper"
            >
              Hizmetleri Gör
            </a>
          </div>
        </div>
        <div className="aspect-[4/5] w-full flex-1 overflow-hidden rounded border border-line md:aspect-[4/5]">
          <img
            src={HERO_IMAGE}
            alt="Berber salonunda saç kesimi"
            className="h-full w-full object-cover"
          />
        </div>
      </section>

      {/* SERVICES */}
      <section id="hizmetler" className="bg-surface px-5 py-16 md:px-10">
        <span className="text-xs font-semibold tracking-[4px] text-copper">HİZMETLERİMİZ</span>
        <h2 className="mt-3 mb-12 font-display text-3xl font-medium md:text-4xl">
          Neye ihtiyacınız var?
        </h2>

        {servicesQuery.isLoading && <p className="text-muted">Hizmetler yükleniyor…</p>}
        {servicesQuery.isError && <p className="text-muted">Hizmetler yüklenemedi.</p>}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {servicesQuery.data?.map((service) => (
            <div
              key={service.id}
              className="flex flex-col gap-8 rounded border border-line bg-ink p-7"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-copper text-copper">
                <ServiceIcon />
              </div>
              <div>
                <div className="font-display text-lg font-medium">{service.name}</div>
                <div className="mt-1.5 text-sm text-muted">{formatDuration(service.duration_min)}</div>
              </div>
              <div className="font-display text-xl font-semibold text-copper">
                {formatPrice(service.price)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* STAFF */}
      <section id="ekip" className="px-5 py-16 md:px-10">
        <span className="text-xs font-semibold tracking-[4px] text-copper">EKİBİMİZ</span>
        <h2 className="mt-3 mb-12 font-display text-3xl font-medium md:text-4xl">
          Ustanızı seçin.
        </h2>

        {staffQuery.isLoading && <p className="text-muted">Personel yükleniyor…</p>}
        {staffQuery.isError && <p className="text-muted">Personel yüklenemedi.</p>}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {staffQuery.data?.map((member) => (
            <div key={member.id} className="overflow-hidden rounded border border-line bg-surface">
              <div className="aspect-square overflow-hidden">
                <img
                  src={staffImageFor(member.id)}
                  alt={`${member.name} ${member.surname}`}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-6">
                <div className="font-display text-xl font-medium">
                  {member.name} {member.surname}
                </div>
                <Link
                  to={`/randevu?staff=${member.id}`}
                  className="mt-4 block w-full rounded-sm border border-line-strong py-3 text-center text-sm font-semibold text-cream hover:border-copper"
                >
                  Bu Ustayı Seç
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="flex flex-wrap items-center justify-between gap-8 border-y border-line bg-surface px-5 py-16 md:px-10">
        <div>
          <h2 className="max-w-lg font-display text-3xl font-medium leading-tight">
            Randevunuzu hemen oluşturun.
          </h2>
          <p className="mt-3 text-muted">Telefon numaranızla doğrulayın, saniyeler içinde onaylayın.</p>
        </div>
        <Link
          to="/randevu"
          className="rounded-sm bg-copper px-10 py-4 text-base font-semibold text-ink hover:bg-copper-bright"
        >
          Randevu Al →
        </Link>
      </section>

    </div>
  )
}
