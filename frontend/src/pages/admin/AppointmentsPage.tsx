import { useQuery } from '@tanstack/react-query'
import { CalendarDays, ChevronLeft, ChevronRight, LayoutList, Plus, Table2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Avatar } from '../../components/ui/Avatar'
import { Button, IconButton } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input } from '../../components/ui/Input'
import { PageHeader } from '../../components/ui/PageHeader'
import { Select } from '../../components/ui/Select'
import { Skeleton } from '../../components/ui/Skeleton'
import { STATUS_LABELS } from '../../components/ui/Badge'
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
import type { AdminAppointmentOut, AppointmentStatus } from '../../types/api'
import { AppointmentsTable } from './AppointmentsTable'
import { AppointmentRow, NewAppointmentModal, useAppointmentFlow, type NewAppointmentPrefill } from './appointmentParts'
import { ErrorBlock, qk, StaffOptions, useStaffList } from './shared'

type View = 'day' | 'week'
type Layout = 'list' | 'table'
// Aktif = onaylı (henüz tamamlanmamış) randevular. Geçmiş = tamamlanan, iptal edilen ve gelmeyen randevular.
type Tab = 'active' | 'history'
type HistoryFilter = 'all' | Exclude<AppointmentStatus, 'confirmed'>
const HISTORY_FILTERS: HistoryFilter[] = ['all', 'completed', 'cancelled', 'no_show']

const LAYOUT_KEY = 'beh.appointments.layout'

function readLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'table' ? 'table' : 'list'
  } catch {
    return 'list'
  }
}

function groupByDate(list: AdminAppointmentOut[]): [string, AdminAppointmentOut[]][] {
  const map = new Map<string, AdminAppointmentOut[]>()
  for (const a of list) map.set(a.appointment_date, [...(map.get(a.appointment_date) ?? []), a])
  return [...map.entries()]
}

/** Günlere göre bölünmüş kart listesi (tek sütun). Hafta görünümünde gün başlığı gösterilir. */
function DateGroups({
  groups,
  showDates,
  today,
  showStaff,
  flow,
}: {
  groups: [string, AdminAppointmentOut[]][]
  showDates: boolean
  today: string
  showStaff: boolean
  flow: ReturnType<typeof useAppointmentFlow>
}) {
  return (
    <div className="flex flex-col gap-6">
      {groups.map(([date, list]) => (
        <section key={date} aria-label={formatDateLong(date)}>
          {showDates && (
            <h3 className="mb-2.5 flex items-baseline justify-between text-sm font-medium capitalize text-muted-strong">
              <span>{date === today ? `Bugün · ${formatDateLong(date)}` : formatDateLong(date)}</span>
              <span className="text-xs normal-case text-muted">{list.length} randevu</span>
            </h3>
          )}
          <ul className="flex flex-col gap-3">
            {list.map((a) => (
              <li key={a.id} className="min-w-0">
                <AppointmentRow appt={a} showStaff={showStaff} flow={flow} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export default function AppointmentsPage() {
  const { isManager, me } = useStaffAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const prefillState = (location.state as { newAppointment?: NewAppointmentPrefill } | null)?.newAppointment ?? null

  const [view, setView] = useState<View>('day')
  const [layout, setLayout] = useState<Layout>(readLayout)
  const [anchor, setAnchor] = useState(todayLocalISO())
  const [tab, setTab] = useState<Tab>('active')
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all')
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

  const activeList = useMemo(() => visible.filter((a) => a.status === 'confirmed'), [visible])
  const historyAll = useMemo(() => visible.filter((a) => a.status !== 'confirmed'), [visible])
  const filtered = useMemo(() => {
    if (tab === 'active') return activeList
    return historyFilter === 'all' ? historyAll : historyAll.filter((a) => a.status === historyFilter)
  }, [tab, activeList, historyAll, historyFilter])

  const historyCounts = useMemo(() => {
    const c: Record<string, number> = { all: historyAll.length }
    for (const a of historyAll) c[a.status] = (c[a.status] ?? 0) + 1
    return c
  }, [historyAll])

  const perDay = useMemo(() => {
    const c: Record<string, number> = {}
    for (const a of query.data ?? []) if (a.status !== 'cancelled') c[a.appointment_date] = (c[a.appointment_date] ?? 0) + 1
    return c
  }, [query.data])

  // Tablo günün tüm programını gösterir (aktif + tamamlanan + gelmeyen); iptaller saati boşalttığı için dahil değil.
  const tableRows = useMemo(() => visible.filter((a) => a.status !== 'cancelled'), [visible])
  const tableStaff = useMemo(() => {
    const all = (staffQ.data ?? []).filter((s) => s.role !== 'technical_support' && s.is_active)
    if (!isManager) return all.filter((s) => s.id === me?.id)
    return staffFilter ? all.filter((s) => String(s.id) === staffFilter) : all
  }, [staffQ.data, isManager, staffFilter, me?.id])

  // Aktif: en yakın en üstte. Geçmiş: en yeni en üstte.
  const sortedFiltered = useMemo(() => {
    const dir = tab === 'history' ? -1 : 1
    return [...filtered].sort(
      (x, y) => dir * (x.appointment_date.localeCompare(y.appointment_date) || x.appointment_time.localeCompare(y.appointment_time)),
    )
  }, [filtered, tab])
  const grouped = useMemo(() => groupByDate(sortedFiltered), [sortedFiltered])

  // "Tüm ekip" seçiliyken (yönetici) randevular personele göre gruplanır; tek berber seçiliyse ya da berber hesabında gruplama yok.
  const groupByStaff = isManager && !staffFilter
  const staffGroups = useMemo(() => {
    if (!groupByStaff) return []
    const byStaff = new Map<number, AdminAppointmentOut[]>()
    for (const a of sortedFiltered) byStaff.set(a.staff.id, [...(byStaff.get(a.staff.id) ?? []), a])
    const order = new Map((staffQ.data ?? []).map((s, i) => [s.id, i]))
    return [...byStaff.entries()]
      .sort(([a], [b]) => (order.get(a) ?? 999) - (order.get(b) ?? 999))
      .map(([id, items]) => ({
        id,
        staff: items[0].staff,
        photo: staffQ.data?.find((s) => s.id === id)?.photo_image ?? null,
        count: items.length,
        byDate: groupByDate(items),
      }))
  }, [groupByStaff, sortedFiltered, staffQ.data])

  const step = effectiveView === 'day' ? 1 : 7
  const rangeLabel =
    effectiveView === 'day'
      ? anchor === today
        ? `Bugün · ${formatDateLong(anchor)}`
        : formatDateLong(anchor)
      : `${formatDateShort(weekStart)} – ${formatDateShort(weekEnd)} · ${formatMonthYear(weekEnd)}`

  const tabItems = [
    { value: 'active' as Tab, label: 'Aktif randevular', count: activeList.length },
    { value: 'history' as Tab, label: 'Geçmiş randevular', count: historyAll.length },
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
          <p className="min-w-0 text-lg font-semibold capitalize text-cream md:text-xl">{rangeLabel}</p>
          <div className="flex flex-wrap items-center gap-2">
            {isManager && (
              <Select aria-label="Berber filtresi" value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} className="min-w-44">
                <option value="">Tüm ekip</option>
                <StaffOptions staff={staffQ.data ?? []} />
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
                  selected ? 'border-copper bg-copper text-on-accent' : 'border-panel-line bg-panel text-cream hover:border-copper/60',
                  !selected && d === today && 'border-copper/60',
                )}
              >
                <span className={cn('text-xs font-medium uppercase', selected ? 'text-on-accent/70' : 'text-muted')}>{formatWeekdayShort(d)}</span>
                <span className="font-display text-lg leading-tight tabular-nums">{parseISODateLocal(d).getDate()}</span>
                <span className={cn('text-xs tabular-nums', selected ? 'text-on-accent/70' : count ? 'text-copper-bright' : 'text-transparent')}>{count || 0}</span>
              </button>
            )
          })}
        </div>

        {layout === 'list' && <Tabs label="Randevu türü" items={tabItems} value={tab} onChange={setTab} />}

        {layout === 'list' && tab === 'history' && (
          <div role="group" aria-label="Geçmiş randevu filtresi" className="flex flex-wrap gap-2">
            {HISTORY_FILTERS.map((f) => {
              const on = historyFilter === f
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setHistoryFilter(f)}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm transition-colors',
                    on ? 'border-copper bg-copper/15 text-cream' : 'border-panel-line text-muted-strong hover:border-copper/60',
                  )}
                >
                  {f === 'all' ? 'Tümü' : STATUS_LABELS[f]}
                  <span className="text-xs tabular-nums text-muted">{historyCounts[f] ?? 0}</span>
                </button>
              )
            })}
          </div>
        )}
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
              title={tab === 'active' ? 'Aktif randevu yok' : historyFilter === 'all' ? 'Geçmiş randevu yok' : `${STATUS_LABELS[historyFilter]} randevu yok`}
              description={
                tab === 'active'
                  ? effectiveView === 'day'
                    ? 'Bu gün için bekleyen randevu bulunmuyor.'
                    : 'Bu hafta için bekleyen randevu bulunmuyor.'
                  : 'Tamamlanan, iptal edilen ve gelmeyen randevular burada görünür.'
              }
              action={
                tab === 'active' ? (
                  <Button variant="secondary" onClick={() => setCreating(true)} leftIcon={<Plus className="size-4" />}>
                    Randevu ekle
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : groupByStaff ? (
          <div className="flex flex-col gap-10">
            {staffGroups.map((g) => (
              <section key={g.id} aria-label={fullName(g.staff)}>
                <header className="mb-4 flex items-center gap-3 border-b border-panel-line pb-3">
                  <Avatar name={fullName(g.staff)} src={g.photo} size="sm" />
                  <h2 className="min-w-0 flex-1 truncate font-display text-lg font-medium text-cream">{fullName(g.staff)}</h2>
                  <span className="shrink-0 rounded-xs bg-cream/5 px-2 py-0.5 text-xs tabular-nums text-muted-strong">{g.count} randevu</span>
                </header>
                <DateGroups groups={g.byDate} showDates={effectiveView === 'week'} today={today} showStaff={false} flow={flow} />
              </section>
            ))}
          </div>
        ) : (
          <div>
            <DateGroups groups={grouped} showDates={effectiveView === 'week'} today={today} showStaff={isManager} flow={flow} />
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
          setTab('active')
        }}
      />
    </>
  )
}
