import { useQuery } from '@tanstack/react-query'
import { CalendarDays, CalendarPlus, CheckCircle2, Clock, Coins, Scissors, Users, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardHeader } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { StatCard } from '../../components/ui/StatCard'
import { StatusBadge } from '../../components/ui/Badge'
import { adminApi } from '../../lib/api'
import { useStaffAuth } from '../../lib/auth'
import { formatDateLong, formatDateShort, formatNumber, formatPrice, formatTime, fullName, todayLocalISO } from '../../lib/format'
import { AppointmentRow, useAppointmentFlow } from './appointmentParts'
import { ErrorBlock, qk } from './shared'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return 'İyi geceler'
  if (h < 12) return 'Günaydın'
  if (h < 18) return 'İyi günler'
  return 'İyi akşamlar'
}

const SHORTCUTS: { to: string; label: string; hint: string; icon: LucideIcon; state?: unknown }[] = [
  { to: '/panel/randevular', label: 'Yeni randevu', hint: 'Yüz yüze / telefon', icon: CalendarPlus, state: { newAppointment: {} } },
  { to: '/panel/randevular', label: 'Tüm randevular', hint: 'Gün ve hafta görünümü', icon: CalendarDays },
  { to: '/panel/musteriler', label: 'Müşteriler', hint: 'Ara ve geçmişe bak', icon: Users },
  { to: '/panel/calisma-saatleri', label: 'Çalışma saatleri', hint: 'Mesai ve izinler', icon: Clock },
]

export default function DashboardPage() {
  const { me, isManager } = useStaffAuth()
  const today = todayLocalISO()
  const flow = useAppointmentFlow()

  const dash = useQuery({ queryKey: [...qk.dashboard, today], queryFn: () => adminApi.getDashboard(today) })
  const agenda = useQuery({
    queryKey: [...qk.appointments, 'today', today],
    queryFn: () => adminApi.listAppointments({ date_from: today, date_to: today }),
  })

  const d = dash.data
  const open = (agenda.data ?? []).filter((a) => a.status === 'pending' || a.status === 'confirmed').length

  return (
    <>
      <PageHeader
        eyebrow={formatDateLong(today)}
        title={`${greeting()}${me ? `, ${me.name}` : ''}`}
        description={
          agenda.data
            ? open > 0
              ? `Bugün sırada ${open} randevu var.`
              : 'Bugün bekleyen randevu kalmadı.'
            : undefined
        }
      />

      {dash.isError && <ErrorBlock className="mb-6" error={dash.error} onRetry={() => void dash.refetch()} />}

      <section aria-label="Özet" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Bugün"
          icon={<CalendarDays />}
          value={d ? formatNumber(d.appointments_today) : ''}
          loading={dash.isLoading}
          hint={d ? `${d.pending_today} bekliyor · ${d.cancelled_today} iptal` : undefined}
        />
        <StatCard
          label="Tamamlanan"
          icon={<CheckCircle2 />}
          tone="success"
          value={d ? formatNumber(d.completed_today) : ''}
          loading={dash.isLoading}
          hint={d ? `${d.appointments_today - d.completed_today - d.cancelled_today} kaldı` : undefined}
        />
        <StatCard
          label="Beklenen ciro"
          icon={<Coins />}
          tone="copper"
          value={d ? formatPrice(d.expected_revenue_today) : ''}
          loading={dash.isLoading}
          hint="İptal ve gelmeyenler hariç"
        />
        <StatCard
          label="Bu hafta"
          icon={<Scissors />}
          value={d ? formatNumber(d.appointments_this_week) : ''}
          loading={dash.isLoading}
          hint={d ? `${formatNumber(d.total_customers)} ${isManager ? 'kayıtlı müşteri' : 'müşteriniz'}` : undefined}
        />
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Bugünün programı */}
        <section aria-label="Bugünün programı" className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-medium text-cream">Bugünün programı</h2>
            <Link to="/panel/randevular" className="inline-flex min-h-11 min-w-11 items-center justify-end text-sm font-medium text-copper-bright hover:underline">
              Tümü
            </Link>
          </div>
          {agenda.isError ? (
            <ErrorBlock error={agenda.error} onRetry={() => void agenda.refetch()} />
          ) : agenda.isLoading ? (
            <div className="flex flex-col gap-2.5" role="status" aria-label="Yükleniyor">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-[6.5rem] w-full" />
              ))}
            </div>
          ) : (agenda.data ?? []).length === 0 ? (
            <div className="rounded-md border border-dashed border-panel-line">
              <EmptyState icon={<CalendarDays />} title="Bugün randevu yok" description="Yeni bir randevu eklediğinizde burada görünür." />
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {(agenda.data ?? []).map((a) => (
                <li key={a.id} className="min-w-0">
                  <AppointmentRow appt={a} showStaff={isManager} flow={flow} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-6">
          {/* Sıradakiler */}
          <Card padding="sm">
            <CardHeader title="Sıradakiler" description="Yaklaşan ilk 5 randevu" className="mb-3" />
            {dash.isLoading ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-11 w-full" />
                ))}
              </div>
            ) : (d?.upcoming ?? []).length === 0 ? (
              <p className="py-2 text-sm text-muted">Yaklaşan randevu yok.</p>
            ) : (
              <ul className="divide-y divide-panel-line">
                {d?.upcoming.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => flow.open(a)} className="flex min-h-14 w-full min-w-0 items-center gap-3 py-2 text-left">
                      <div className="w-14 shrink-0">
                        <p className="font-display text-lg leading-none tabular-nums text-cream">{formatTime(a.appointment_time)}</p>
                        <p className="mt-1 text-xs text-muted">{a.appointment_date === today ? 'Bugün' : formatDateShort(a.appointment_date)}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-cream">{fullName(a.customer)}</p>
                        <p className="truncate text-xs text-muted">{a.service.name}</p>
                      </div>
                      <StatusBadge status={a.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Kısayollar */}
          <nav aria-label="Kısayollar" className="grid grid-cols-2 gap-2.5">
            {SHORTCUTS.map((s) => (
              <Link
                key={s.label}
                to={s.to}
                state={s.state}
                className="flex min-h-24 min-w-0 flex-col justify-between rounded-md border border-panel-line bg-panel p-3.5 transition-colors hover:border-copper/70 active:bg-panel-hover"
              >
                <s.icon className="size-5 text-copper-bright" aria-hidden="true" />
                <span className="mt-3 block min-w-0">
                  <span className="block truncate text-sm font-medium text-cream">{s.label}</span>
                  <span className="block truncate text-xs text-muted">{s.hint}</span>
                </span>
              </Link>
            ))}
          </nav>
        </aside>
      </div>

      {flow.element}
    </>
  )
}
