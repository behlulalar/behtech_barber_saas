import { useQuery } from '@tanstack/react-query'
import { CalendarDays, ChevronLeft, ChevronRight, LayoutList, Plus, Table2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, IconButton } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input } from '../../components/ui/Input'
import { PageHeader } from '../../components/ui/PageHeader'
import { Select } from '../../components/ui/Select'
import { Skeleton } from '../../components/ui/Skeleton'
import { STATUS_LABELS, STATUS_ORDER } from '../../components/ui/Badge'
import { SegmentedControl, Tabs } from '../../components/ui/Tabs'
import { adminApi } from '../../lib/api'
import { useStaffAuth } from '../../lib/auth'
import { cn } from '../../lib/cn'
import {
  addDaysISO,
  formatDateLong,
  formatDateShort,
  formatMonthYear,
  formatWeekdayShort,
  fullName,
  parseISODateLocal,
  startOfWeekISO,
  todayLocalISO,
} from '../../lib/format'
import type { AppointmentStatus } from '../../types/api'
import { AppointmentsTable } from './AppointmentsTable'
import { AppointmentRow, NewAppointmentModal, useAppointmentFlow, type NewAppointmentPrefill } from './appointmentParts'
import { ErrorBlock, qk, useStaffList } from './shared'

type View = 'day' | 'week'
type Layout = 'list' | 'table'
type StatusFilter = 'all' | AppointmentStatus

const LAYOUT_KEY = 'beh.appointments.layout'

function readLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'table' ? 'table' : 'list'
  } catch {
    return 'list'
  }
}

export default function AppointmentsPage() {
  const { isManager, me } = useStaffAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const prefillState = (location.state as { newAppointment?: NewAppointmentPrefill } | null)?.newAppointment ?? null

  const [view, setView] = useState<View>('day')
  const [layout, setLayout] = useState<Layout>(readLayout)
  const [anchor, setAnchor] = useState(todayLocalISO())
  const [status, setStatus] = useState<StatusFilter>('all')
  const [staffFilter, setStaffFilter] = useState('')
  const [creating, setCreating] = useState(Boolean(prefillState))
  const [prefill, setPrefill] = useState<NewAppointmentPrefill | null>(prefillState)

  const flow = useAppointmentFlow()
  const staffQ = useStaffList()

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_KEY, layout)
    } catch {
      /* tercih kaydedilemezse sorun değil */
    }
  }, [layout])
  // Tablo tek bir günü gösterir; hafta görünümü yalnızca listede anlamlı.
  const effectiveView: View = layout === 'table' ? 'day' : view

  const weekStart = startOfWeekISO(anchor)
  const weekEnd = addDaysISO(weekStart, 6)
  const today = todayLocalISO()

  const query = useQuery({
    queryKey: [...qk.appointments, weekStart, isManager ? staffFilter : 'self'],
    queryFn: () =>
      adminApi.listAppointments({
        date_from: weekStart,
        date_to: weekEnd,
        staff_id: isManager && staffFilter ? Number(staffFilter) : undefined,
      }),
    placeholderData: (prev) => prev,
  })

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i)), [weekStart])

  const visible = useMemo(() => {
    const all = query.data ?? []
    return effectiveView === 'day' ? all.filter((a) => a.appointment_date === anchor) : all
  }, [query.data, effectiveView, anchor])

  const filtered = useMemo(() => (status === 'all' ? visible : visible.filter((a) => a.status === status)), [visible, status])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: visible.length }
    for (const a of visible) c[a.status] = (c[a.status] ?? 0) + 1
    return c
  }, [visible])

  const perDay = useMemo(() => {
    const c: Record<string, number> = {}
    for (const a of query.data ?? []) if (a.status !== 'cancelled') c[a.appointment_date] = (c[a.appointment_date] ?? 0) + 1
    return c
  }, [query.data])

  // Tabloda iptal edilenler (saati boşalttığı için) yalnızca "İptal" sekmesinde gösterilir.
  const tableRows = useMemo(() => (status === 'all' ? filtered.filter((a) => a.status !== 'cancelled') : filtered), [filtered, status])
  const tableStaff = useMemo(() => {
    const all = (staffQ.data ?? []).filter((s) => s.role !== 'technical_support')
    if (!isManager) return all.filter((s) => s.id === me?.id)
    return staffFilter ? all.filter((s) => String(s.id) === staffFilter) : all
  }, [staffQ.data, isManager, staffFilter, me?.id])

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>()
    for (const a of [...filtered].sort((x, y) => x.appointment_time.localeCompare(y.appointment_time))) {
      const list = map.get(a.appointment_date) ?? []
      list.push(a)
      map.set(a.appointment_date, list)
    }
    return [...map.entries()]
  }, [filtered])

  const step = effectiveView === 'day' ? 1 : 7
  const rangeLabel =
    effectiveView === 'day'
      ? anchor === today
        ? `Bugün · ${formatDateLong(anchor)}`
        : formatDateLong(anchor)
      : `${formatDateShort(weekStart)} – ${formatDateShort(weekEnd)} · ${formatMonthYear(weekEnd)}`

  const tabItems = [
    { value: 'all' as StatusFilter, label: 'Tümü', count: counts.all },
    ...STATUS_ORDER.map((s) => ({ value: s as StatusFilter, label: STATUS_LABELS[s], count: counts[s] ?? 0 })),
  ]

  function closeCreate() {
    setCreating(false)
    setPrefill(null)
    if (prefillState) navigate(location.pathname, { replace: true, state: null })
  }

  return (
    <>
      <PageHeader
        title="Randevular"
        description={isManager ? 'Tüm ekibin randevuları.' : 'Size ait randevular.'}
        actions={
          <Button onClick={() => setCreating(true)} leftIcon={<Plus className="size-4" />}>
            Yeni randevu
          </Button>
        }
      />

      {/* Gezinme */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <IconButton label={effectiveView === 'day' ? 'Önceki gün' : 'Önceki hafta'} onClick={() => setAnchor(addDaysISO(anchor, -step))} className="border border-panel-line">
            <ChevronLeft className="size-5" />
          </IconButton>
          <Input
            type="date"
            aria-label="Tarihe git"
            value={anchor}
            onChange={(e) => e.target.value && setAnchor(e.target.value)}
            className="min-w-[8.5rem] flex-1 text-center md:max-w-52 md:flex-none"
          />
          <IconButton label={effectiveView === 'day' ? 'Sonraki gün' : 'Sonraki hafta'} onClick={() => setAnchor(addDaysISO(anchor, step))} className="border border-panel-line">
            <ChevronRight className="size-5" />
          </IconButton>
          <Button variant="secondary" onClick={() => setAnchor(today)} disabled={weekStart === startOfWeekISO(today) && anchor === today}>
            Bugün
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 text-sm font-medium capitalize text-muted-strong">{rangeLabel}</p>
          <div className="flex flex-wrap items-center gap-2">
            {isManager && (
              <Select aria-label="Berber filtresi" value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} className="min-w-44">
                <option value="">Tüm ekip</option>
                {(staffQ.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {fullName(s)}
                  </option>
                ))}
              </Select>
            )}
            {layout === 'list' && (
              <SegmentedControl
                label="Kapsam"
                value={view}
                onChange={setView}
                items={[
                  { value: 'day', label: 'Gün' },
                  { value: 'week', label: 'Hafta' },
                ]}
              />
            )}
            <SegmentedControl
              label="Görünüm"
              value={layout}
              onChange={setLayout}
              items={[
                {
                  value: 'list',
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <LayoutList className="size-4" aria-hidden="true" />
                      Liste
                    </span>
                  ),
                },
                {
                  value: 'table',
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <Table2 className="size-4" aria-hidden="true" />
                      Tablo
                    </span>
                  ),
                },
              ]}
            />
          </div>
        </div>

        {/* Hafta şeridi */}
        <div className="grid grid-cols-7 gap-0.5 min-[400px]:gap-1" role="group" aria-label="Haftanın günleri">
          {weekDays.map((d) => {
            const selected = effectiveView === 'day' && d === anchor
            const count = perDay[d] ?? 0
            return (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setAnchor(d)
                  setView('day')
                }}
                aria-pressed={selected}
                aria-label={`${formatDateLong(d)}, ${count} randevu`}
                className={cn(
                  'flex min-h-14 min-w-0 flex-col items-center justify-center rounded-sm border py-1.5 transition-colors',
                  selected ? 'border-copper bg-copper text-ink' : 'border-panel-line bg-panel text-cream hover:border-copper/60',
                  !selected && d === today && 'border-copper/60',
                )}
              >
                <span className={cn('text-xs font-medium uppercase', selected ? 'text-ink/70' : 'text-muted')}>{formatWeekdayShort(d)}</span>
                <span className="font-display text-lg leading-tight tabular-nums">{parseISODateLocal(d).getDate()}</span>
                <span className={cn('text-xs tabular-nums', selected ? 'text-ink/70' : count ? 'text-copper-bright' : 'text-transparent')}>{count || 0}</span>
              </button>
            )
          })}
        </div>

        <Tabs label="Durum filtresi" items={tabItems} value={status} onChange={setStatus} />
      </div>

      {/* Liste */}
      <div className="mt-5">
        {query.isError ? (
          <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />
        ) : query.isLoading ? (
          <div className="flex flex-col gap-2.5" role="status" aria-label="Yükleniyor">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[6.5rem] w-full" />
            ))}
          </div>
        ) : layout === 'table' ? (
          <AppointmentsTable
            date={anchor}
            appointments={tableRows}
            staff={tableStaff}
            flow={flow}
            onCreate={(slot) => {
              setPrefill({ staffId: slot.staffId, date: slot.date, time: slot.time })
              setCreating(true)
            }}
          />
        ) : filtered.length === 0 ? (
          <div className="rounded-md border border-dashed border-panel-line">
            <EmptyState
              icon={<CalendarDays />}
              title={status === 'all' ? 'Randevu yok' : `${STATUS_LABELS[status]} randevu yok`}
              description={effectiveView === 'day' ? 'Bu gün için kayıtlı randevu bulunmuyor.' : 'Bu hafta için kayıtlı randevu bulunmuyor.'}
              action={
                <Button variant="secondary" onClick={() => setCreating(true)} leftIcon={<Plus className="size-4" />}>
                  Randevu ekle
                </Button>
              }
            />
          </div>
        ) : (
          <div className="flex max-w-3xl flex-col gap-6">
            {grouped.map(([date, list]) => (
              <section key={date} aria-label={formatDateLong(date)}>
                {effectiveView === 'week' && (
                  <h2 className="mb-2.5 flex items-baseline justify-between text-sm font-medium capitalize text-muted-strong">
                    <span>{date === today ? `Bugün · ${formatDateLong(date)}` : formatDateLong(date)}</span>
                    <span className="text-xs text-muted">{list.length} randevu</span>
                  </h2>
                )}
                <ul className="flex flex-col gap-3">
                  {list.map((a) => (
                    <li key={a.id} className="min-w-0">
                      <AppointmentRow appt={a} showStaff={isManager} flow={flow} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {flow.element}
      <NewAppointmentModal
        open={creating}
        onClose={closeCreate}
        defaultDate={anchor}
        prefill={prefill}
        onCreated={(appt) => {
          closeCreate()
          setAnchor(appt.appointment_date)
          setView('day')
          setStatus('all')
        }}
      />
    </>
  )
}
