import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { CalendarDays, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, Clock, Coins, Scissors, Users, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { StatCard } from '../../components/ui/StatCard'
import { adminApi } from '../../lib/api'
import { useStaffAuth } from '../../lib/auth'
import { cn } from '../../lib/cn'
import { addDaysISO, formatDateLong, formatNumber, formatPrice, todayLocalISO } from '../../lib/format'
import { AppointmentRow, useAppointmentFlow } from './appointmentParts'
import { ClosureCard } from './ClosureCard'
import { SetupGuide } from './SetupGuide'
import { ShareCard } from './ShareCard'
import { ErrorBlock, qk } from './shared'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return 'İyi geceler'
  if (h < 12) return 'Günaydın'
  if (h < 18) return 'İyi günler'
  return 'İyi akşamlar'
}

const SHORTCUTS: { to: string; label: string; hint: string; icon: LucideIcon; state?: unknown; managerOnly?: boolean }[] = [
  { to: '/panel/randevular', label: 'Yeni randevu', hint: 'Yüz yüze / telefon', icon: CalendarPlus, state: { newAppointment: {} } },
  { to: '/panel/randevular', label: 'Tüm randevular', hint: 'Gün ve hafta görünümü', icon: CalendarDays },
  { to: '/panel/musteriler', label: 'Müşteriler', hint: 'Ara ve geçmişe bak', icon: Users },
  { to: '/panel/calisma-saatleri', label: 'Çalışma saatleri', hint: 'Mesai ve izinler', icon: Clock, managerOnly: true },
]

export default function DashboardPage() {
  const { me, isManager } = useStaffAuth()
  const today = todayLocalISO()
  const flow = useAppointmentFlow()

  const dash = useQuery({ queryKey: [...qk.dashboard, today], queryFn: () => adminApi.getDashboard(today) })
  // En yakın günün programı: bugünden itibaren 14 gün taranır; bugün bekleyen (onaylı) randevu varsa bugün, yoksa randevusu olan ilk gün.
  const agenda = useQuery({
    queryKey: [...qk.appointments, 'dashboard', today],
    queryFn: () => adminApi.listAppointments({ date_from: today, date_to: addDaysISO(today, 14) }),
  })

  const d = dash.data
  const upcoming = useMemo(() => {
    const live = (agenda.data ?? []).filter((a) => a.status !== 'cancelled') // iptaller programda kalabalık yapmasın
    const hasPending = (day: string) => live.some((a) => a.appointment_date === day && a.status === 'confirmed')
    const days = Array.from(new Set(live.map((a) => a.appointment_date))).sort()
    const day = days.find((x) => hasPending(x)) ?? days[0] ?? null
    const items = live
      .filter((a) => a.appointment_date === day)
      .sort((x, y) => x.appointment_time.localeCompare(y.appointment_time))
    return { day, items }
  }, [agenda.data])
  // Üst açıklama yalnızca BUGÜN bekleyen randevuyu sayar (program başka bir günü gösterse bile).
  const todayPending = (agenda.data ?? []).filter((a) => a.appointment_date === today && a.status === 'confirmed').length

  // Sayfalama: 4'erli. Gün değişirse ilk sayfaya dön.
  const PAGE = 4
  const [pageState, setPageState] = useState<{ day: string | null; page: number }>({ day: null, page: 0 })
  const page = pageState.day === upcoming.day ? pageState.page : 0
  const lastPage = Math.max(0, Math.ceil(upcoming.items.length / PAGE) - 1)
  const shown = upcoming.items.slice(page * PAGE, page * PAGE + PAGE)
  const goto = (p: number) => setPageState({ day: upcoming.day, page: Math.min(lastPage, Math.max(0, p)) })
  const isToday = upcoming.day === today
  const dayTitle = upcoming.day == null ? 'Bugünün programı' : isToday ? 'Bugünün programı' : upcoming.day === addDaysISO(today, 1) ? 'Yarının programı' : formatDateLong(upcoming.day)

  return (
    <>
      <PageHeader
        eyebrow={formatDateLong(today)}
        title={`${greeting()}${me ? `, ${me.name}` : ''}`}
        description={
          agenda.data
            ? todayPending > 0
              ? `Bugün sırada ${todayPending} randevu var.`
              : 'Bugün bekleyen randevu kalmadı.'
            : undefined
        }
      />

      {isManager && <SetupGuide />}
      {isManager && <ClosureCard />}
      {isManager && <ShareCard />}

      {dash.isError && <ErrorBlock className="mb-6" error={dash.error} onRetry={() => void dash.refetch()} />}

      <section aria-label="Özet" className={cn('grid grid-cols-2 gap-3', isManager ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
        <StatCard
          label="Bugün"
          icon={<CalendarDays />}
          value={d ? formatNumber(d.appointments_today) : ''}
          loading={dash.isLoading}
          hint={d ? `${d.cancelled_today} iptal` : undefined}
        />
        <StatCard
          label="Tamamlanan"
          icon={<CheckCircle2 />}
          tone="success"
          value={d ? formatNumber(d.completed_today) : ''}
          loading={dash.isLoading}
          hint={d ? `${d.appointments_today - d.completed_today - d.cancelled_today} kaldı` : undefined}
        />
        {isManager && (
          <StatCard
            label="Beklenen ciro"
            icon={<Coins />}
            tone="copper"
            value={d?.expected_revenue_today != null ? formatPrice(d.expected_revenue_today) : ''}
            loading={dash.isLoading}
            hint="İptal ve gelmeyenler hariç"
          />
        )}
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
        <section aria-label="Yaklaşan program" className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-xl font-medium text-cream">{dayTitle}</h2>
              {upcoming.day && !isToday && (
                <p className="text-xs text-muted">Bugün bekleyen randevu yok; en yakın randevulu gün gösteriliyor.</p>
              )}
            </div>
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
          ) : upcoming.items.length === 0 ? (
            <div className="rounded-md border border-dashed border-panel-line">
              <EmptyState icon={<CalendarDays />} title="Yaklaşan randevu yok" description="Yeni bir randevu eklediğinizde burada görünür." />
            </div>
          ) : (
            <>
              <ul className="flex flex-col gap-2.5">
                {shown.map((a) => (
                  <li key={a.id} className="min-w-0">
                    <AppointmentRow appt={a} showStaff={isManager} flow={flow} />
                  </li>
                ))}
              </ul>
              {upcoming.items.length > PAGE && (
                <div className="mt-3 flex items-center justify-between gap-2">
                  {page > 0 ? (
                    <Button variant="secondary" leftIcon={<ChevronLeft className="size-4" />} onClick={() => goto(page - 1)}>
                      Önceki
                    </Button>
                  ) : (
                    <span aria-hidden="true" />
                  )}
                  <span className="text-xs tabular-nums text-muted" aria-live="polite">
                    {page * PAGE + 1}–{Math.min(upcoming.items.length, page * PAGE + PAGE)} / {upcoming.items.length}
                  </span>
                  {page < lastPage ? (
                    <Button variant="secondary" rightIcon={<ChevronRight className="size-4" />} onClick={() => goto(page + 1)}>
                      Devamı
                    </Button>
                  ) : (
                    <span aria-hidden="true" />
                  )}
                </div>
              )}
            </>
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-6">
          {/* Kısayollar */}
          <nav aria-label="Kısayollar" className="grid grid-cols-2 gap-2.5">
            {SHORTCUTS.filter((s) => isManager || !s.managerOnly).map((s) => (
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
