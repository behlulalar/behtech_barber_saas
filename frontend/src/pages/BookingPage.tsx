import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'

function ServiceIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export default function BookingPage() {
  const staffQuery = useQuery({ queryKey: ['staff'], queryFn: api.getStaff })
  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: api.getServices })

  return (
    <div className="min-h-screen bg-ink text-cream">
      {/* NAV */}
      <nav className="flex items-center justify-between border-b border-line px-6 py-6 md:px-18">
        <div className="flex flex-col leading-none">
          <span className="font-display text-xl font-semibold tracking-wide">Sefa Pertev</span>
          <span className="mt-1 text-[11px] tracking-[3px] text-copper">BERBER SALONU</span>
        </div>
        <div className="hidden items-center gap-10 md:flex">
          <a href="#hizmetler" className="text-sm font-medium text-muted-strong hover:text-cream">
            Hizmetler
          </a>
          <a href="#ekip" className="text-sm font-medium text-muted-strong hover:text-cream">
            Ekibimiz
          </a>
          <Link
            to="/randevu"
            className="rounded-sm bg-copper px-6 py-3 text-sm font-semibold text-ink hover:bg-copper-bright"
          >
            Randevu Al
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="flex flex-col items-center gap-16 px-6 py-20 md:flex-row md:px-18 md:py-24">
        <div className="flex flex-1 flex-col gap-7">
          <span className="text-xs font-semibold tracking-[4px] text-copper">
            BEHTECH BERBER SAAS
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
          <div className="mt-3 flex gap-4">
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
        <div className="flex h-[420px] w-full flex-1 items-center justify-center rounded border border-line bg-surface-raised md:h-[560px]">
          <span className="font-display text-lg italic text-muted">[ Berber salonu fotoğrafı ]</span>
        </div>
      </section>

      {/* SERVICES */}
      <section id="hizmetler" className="bg-surface px-6 py-20 md:px-18">
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
                <div className="mt-1.5 text-sm text-muted">{service.duration_min} dakika</div>
              </div>
              <div className="font-display text-xl font-semibold text-copper">
                {service.price}₺
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* STAFF */}
      <section id="ekip" className="px-6 py-20 md:px-18">
        <span className="text-xs font-semibold tracking-[4px] text-copper">EKİBİMİZ</span>
        <h2 className="mt-3 mb-12 font-display text-3xl font-medium md:text-4xl">
          Ustanızı seçin.
        </h2>

        {staffQuery.isLoading && <p className="text-muted">Personel yükleniyor…</p>}
        {staffQuery.isError && <p className="text-muted">Personel yüklenemedi.</p>}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {staffQuery.data?.map((member) => (
            <div key={member.id} className="overflow-hidden rounded border border-line bg-surface">
              <div className="flex h-70 items-center justify-center bg-surface-raised">
                <span className="font-display text-sm italic text-muted">[ fotoğraf ]</span>
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
      <section className="flex flex-wrap items-center justify-between gap-8 border-y border-line bg-surface px-6 py-20 md:px-18">
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

      {/* FOOTER */}
      <footer className="flex items-center justify-between px-6 py-12 md:px-18">
        <div className="flex flex-col leading-tight">
          <span className="font-display text-base font-semibold">Sefa Pertev Berber</span>
          <span className="mt-1 text-[13px] text-muted">© 2026 — behtechlabs.com altyapısıyla</span>
        </div>
      </footer>
    </div>
  )
}
