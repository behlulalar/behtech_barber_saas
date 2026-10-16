import { useQueries } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { adminApi } from '../../lib/api'
import { cn } from '../../lib/cn'
import { formatTimeRange, fullName, parseISODateLocal, todayLocalISO } from '../../lib/format'
import type { AdminAppointmentOut, AdminStaff, AppointmentStatus } from '../../types/api'
import { STATUS_LABELS } from '../../components/ui/Badge'
import type { useAppointmentFlow } from './appointmentParts'
import { qk } from './shared'

/**
 * Günlük program tablosu: üstte personeller, solda 30 dakikalık slotlar (randevu motoruyla aynı ızgara).
 * Randevular hizmet süresi kadar slot kaplar; çalışmadığı saatler / izin günleri gölgelidir;
 * boş bir saate dokunmak o personel ve saatle yeni randevu açar.
 */

const SLOT = 30
/** Bir slotun satır yüksekliği (px). Randevu blokları süre/30 × bu değer kadar yüksektir. */
const SLOT_PX = 64
const GUTTER = '3.75rem'
const COL_MIN = '10.5rem'

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** Bitişi 00:00 olan çalışma günü "gün sonu" sayılır (backend ile aynı kural). */
function windowOf(start: string, end: string): [number, number] {
  const s = toMin(start)
  let e = toMin(end)
  if (e <= s) e = 24 * 60
  return [s, e]
}

interface Placed {
  appt: AdminAppointmentOut
  start: number
  end: number
  lane: number
  lanes: number
}

/** Aynı personelin çakışan randevularını yan yana şeritlere dağıtır (iptal edilmişler gösteriliyorsa üst üste binebilir). */
function layoutColumn(appts: AdminAppointmentOut[]): Placed[] {
  const items = appts
    .map((appt) => {
      const start = toMin(appt.appointment_time)
      return { appt, start, end: start + Math.max(1, Math.ceil(appt.service.duration_min / SLOT)) * SLOT }
    })
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const out: Placed[] = []
  let cluster: Placed[] = []
  let clusterEnd = -1
  let laneEnds: number[] = []
  const flush = () => {
    for (const p of cluster) p.lanes = laneEnds.length
    out.push(...cluster)
    cluster = []
    laneEnds = []
  }
  for (const it of items) {
    if (cluster.length && it.start >= clusterEnd) flush()
    let lane = laneEnds.findIndex((e) => e <= it.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(it.end)
    } else laneEnds[lane] = it.end
    cluster.push({ ...it, lane, lanes: 1 })
    clusterEnd = Math.max(clusterEnd, it.end)
  }
  flush()
  return out
}

const BLOCK_STYLES: Record<AppointmentStatus, string> = {
  confirmed: 'border-copper bg-copper/15 hover:bg-copper/25',
  completed: 'border-success bg-success/15 hover:bg-success/25',
  no_show: 'border-danger bg-danger/15 hover:bg-danger/25',
  cancelled: 'border-line-strong bg-panel-raised/60 opacity-70 hover:opacity-100',
}

const LEGEND: AppointmentStatus[] = ['confirmed', 'completed', 'no_show', 'cancelled']
const DOT: Record<AppointmentStatus, string> = {
  confirmed: 'bg-copper',
  completed: 'bg-success',
  no_show: 'bg-danger',
  cancelled: 'bg-line-strong',
}

interface Props {
  date: string
  appointments: AdminAppointmentOut[]
  staff: AdminStaff[]
  flow: ReturnType<typeof useAppointmentFlow>
  onCreate: (slot: { staffId: number; date: string; time: string }) => void
}

export function AppointmentsTable({ date, appointments, staff, flow, onCreate }: Props) {
  const today = todayLocalISO()
  const isToday = date === today
  const isPastDay = date < today

  // Şimdiki zaman çizgisi için dakikada bir güncelle.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!isToday) return
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [isToday])
  const nowMin = now.getHours() * 60 + now.getMinutes()

  // Personel başına çalışma saatleri ve izinler (SchedulePage ile aynı sorgu anahtarları → önbellekten gelir).
  const hoursQs = useQueries({
    queries: staff.map((s) => ({
      queryKey: [...qk.workingHours, s.id],
      queryFn: () => adminApi.getWorkingHours(s.id),
      staleTime: 60_000,
    })),
  })
  const offQs = useQueries({
    queries: staff.map((s) => ({
      queryKey: [...qk.timeOff, s.id],
      queryFn: () => adminApi.listTimeOff(s.id),
      staleTime: 60_000,
    })),
  })

  const weekday = parseISODateLocal(date).getDay() // 0=Pazar (working_hours ile aynı)

  const columns = useMemo(
    () =>
      staff.map((s, i) => {
        const hours = (hoursQs[i]?.data ?? []).find((h) => h.day_of_week === weekday)
        const off = (offQs[i]?.data ?? []).some((t) => t.start_date <= date && date <= t.end_date)
        const loaded = hoursQs[i]?.isSuccess && offQs[i]?.isSuccess
        const window = hours && !off ? windowOf(hours.start_time, hours.end_time) : null
        const list = appointments.filter((a) => a.staff.id === s.id)
        return { staff: s, window, off, loaded, placed: layoutColumn(list), count: list.filter((a) => a.status !== 'cancelled').length }
      }),
    // hoursQs/offQs her render yeni dizi; veri değişimini data referanslarından yakala.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [staff, appointments, weekday, date, ...hoursQs.map((q) => q.data), ...offQs.map((q) => q.data)],
  )

  // Satır aralığı: tüm personelin çalışma pencerelerinin birleşimi + gün içindeki tüm randevular.
  const [rangeStart, rangeEnd] = useMemo(() => {
    let lo = Infinity
    let hi = -Infinity
    for (const c of columns) {
      if (c.window) {
        lo = Math.min(lo, c.window[0])
        hi = Math.max(hi, c.window[1])
      }
      for (const p of c.placed) {
        lo = Math.min(lo, p.start)
        hi = Math.max(hi, p.end)
      }
    }
    if (!Number.isFinite(lo)) [lo, hi] = [9 * 60, 20 * 60]
    return [Math.floor(lo / SLOT) * SLOT, Math.min(24 * 60, Math.ceil(hi / SLOT) * SLOT)]
  }, [columns])

  const rows = Math.max(1, (rangeEnd - rangeStart) / SLOT)
  const slotStarts = Array.from({ length: rows }, (_, i) => rangeStart + i * SLOT)
  const gridHeight = rows * SLOT_PX
  const nowTop = isToday && nowMin >= rangeStart && nowMin <= rangeEnd ? ((nowMin - rangeStart) / SLOT) * SLOT_PX : null

  // Gün değişince/ilk açılışta: bugünse şimdiki saate, değilse ilk randevuya kaydır (başlıkta 09:00 boşluğunda kalmasın).
  const scrollRef = useRef<HTMLDivElement>(null)
  const firstStart = useMemo(() => {
    const starts = columns.flatMap((c) => c.placed.map((p) => p.start))
    return starts.length ? Math.min(...starts) : null
  }, [columns])
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const target = isToday && nowMin >= rangeStart ? nowMin : firstStart ?? rangeStart
    el.scrollTop = Math.max(0, ((target - rangeStart) / SLOT - 1) * SLOT_PX)
    // yalnızca gün / aralık değişince; dakikalık "şimdi" güncellemesi kaydırmayı bozmasın
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, rangeStart, rangeEnd, firstStart === null])

  const template = `${GUTTER} repeat(${Math.max(1, columns.length)}, minmax(${COL_MIN}, 1fr))`

  if (columns.length === 0) {
    return <p className="rounded-md border border-dashed border-panel-line p-6 text-center text-sm text-muted">Gösterilecek personel yok.</p>
  }

  return (
    <div>
      <div
        ref={scrollRef}
        className="relative max-h-[72dvh] overflow-auto rounded-md border border-panel-line bg-panel"
        role="region"
        aria-label="Günlük randevu tablosu"
        tabIndex={0}
      >
        <div className="grid min-w-max" style={{ gridTemplateColumns: template }}>
          {/* Başlık satırı */}
          <div className="sticky left-0 top-0 z-30 border-b border-r border-panel-line bg-panel" />
          {columns.map((c) => (
            <div key={c.staff.id} className="sticky top-0 z-20 min-w-0 border-b border-r border-panel-line bg-panel px-3 py-2.5 last:border-r-0">
              <p className="truncate text-sm font-medium text-cream">{fullName(c.staff)}</p>
              <p className="text-xs text-muted">
                {c.off ? 'İzinli' : c.loaded && !c.window ? 'Çalışmıyor' : `${c.count} randevu`}
              </p>
            </div>
          ))}

          {/* Saat sütunu */}
          <div className="sticky left-0 z-10 border-r border-panel-line bg-panel" style={{ height: gridHeight }}>
            {slotStarts.map((m, i) => (
              <div
                key={m}
                className={cn('flex items-start justify-end pr-2 pt-1 text-xs tabular-nums', m % 60 === 0 ? 'text-muted-strong' : 'text-muted')}
                style={{ height: SLOT_PX }}
              >
                <span className={cn(i === 0 && 'translate-y-0')}>{hhmm(m)}</span>
              </div>
            ))}
          </div>

          {/* Personel sütunları */}
          {columns.map((c) => (
            <div key={c.staff.id} className="relative min-w-0 border-r border-panel-line last:border-r-0" style={{ height: gridHeight }}>
              {/* Boş slotlar */}
              {slotStarts.map((m) => {
                const inWindow = c.window ? m >= c.window[0] && m + SLOT <= c.window[1] : false
                const past = isPastDay || (isToday && m + SLOT <= nowMin)
                const taken = c.placed.some((p) => p.appt.status !== 'cancelled' && m < p.end && m + SLOT > p.start)
                const open = inWindow && !past && !taken
                const hour = m % 60 === 0
                const base = cn(
                  'absolute inset-x-0 border-t',
                  hour ? 'border-panel-line' : 'border-panel-line/50 border-dashed',
                )
                const style = { top: ((m - rangeStart) / SLOT) * SLOT_PX, height: SLOT_PX }
                if (!open) {
                  return (
                    <div
                      key={m}
                      aria-hidden="true"
                      className={cn(base, !inWindow && c.loaded && 'bg-[repeating-linear-gradient(135deg,transparent_0_6px,color-mix(in_srgb,var(--color-cream)_5%,transparent)_6px_12px)]', past && inWindow && 'bg-ink/30')}
                      style={style}
                    />
                  )
                }
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onCreate({ staffId: c.staff.id, date, time: hhmm(m) })}
                    aria-label={`${fullName(c.staff)}, ${hhmm(m)} saatine randevu ekle`}
                    className={cn(base, 'group flex items-center justify-center text-copper-bright outline-offset-[-2px] transition-colors hover:bg-copper/10 focus-visible:bg-copper/10')}
                    style={style}
                  >
                    <Plus className="size-4 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
                  </button>
                )
              })}

              {/* Randevu blokları */}
              {c.placed.map((p) => {
                const a = p.appt
                const top = ((p.start - rangeStart) / SLOT) * SLOT_PX
                const height = ((p.end - p.start) / SLOT) * SLOT_PX
                const short = p.end - p.start <= SLOT
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => flow.open(a)}
                    title={`${fullName(a.customer)} · ${a.service.name} · ${formatTimeRange(a.appointment_time, a.service.duration_min)} · ${STATUS_LABELS[a.status]}`}
                    aria-label={`${fullName(a.customer)}, ${a.service.name}, ${formatTimeRange(a.appointment_time, a.service.duration_min)}, ${STATUS_LABELS[a.status]}`}
                    className={cn(
                      'absolute z-[5] flex min-w-0 flex-col overflow-hidden rounded-sm border-l-[3px] px-2 py-1 text-left transition-colors',
                      BLOCK_STYLES[a.status],
                    )}
                    style={{
                      top: top + 2,
                      height: height - 4,
                      left: `calc(${(p.lane / p.lanes) * 100}% + 2px)`,
                      width: `calc(${100 / p.lanes}% - 4px)`,
                    }}
                  >
                    <span className="truncate text-xs tabular-nums text-muted-strong">{formatTimeRange(a.appointment_time, a.service.duration_min)}</span>
                    <span className={cn('truncate text-sm font-medium text-cream', a.status === 'cancelled' && 'line-through decoration-muted/60')}>
                      {fullName(a.customer)}
                    </span>
                    <span className={cn('truncate text-xs text-muted-strong', short && 'hidden min-[420px]:block')}>{a.service.name}</span>
                  </button>
                )
              })}

              {/* Şimdiki zaman çizgisi */}
              {nowTop !== null && (
                <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-[8] border-t-2 border-danger" style={{ top: nowTop }}>
                  <span className="absolute -left-1 -top-[5px] size-2 rounded-full bg-danger" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
        {LEGEND.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-sm', DOT[s])} aria-hidden="true" />
            {STATUS_LABELS[s]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm border border-panel-line bg-[repeating-linear-gradient(135deg,transparent_0_2px,color-mix(in_srgb,var(--color-cream)_25%,transparent)_2px_4px)]" aria-hidden="true" />
          Çalışmıyor / izinli
        </span>
        <span className="basis-full sm:ml-auto sm:basis-auto">Boş bir saate dokunarak randevu ekleyin.</span>
      </div>
    </div>
  )
}
