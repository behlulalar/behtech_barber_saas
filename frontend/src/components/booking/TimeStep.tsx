import { useEffect, useMemo, useRef } from 'react'
import { cn } from '../../lib/cn'
import { formatDateLong, formatWeekdayShort, parseISODateLocal } from '../../lib/format'
import type { SlotsResponse } from '../../types/api'
import { LoadError } from './LoadError'
import { SlotGrid, SlotGridSkeleton } from './SlotGrid'

/** Gün şeridi + seçilen günün saat ızgarası. Randevu alırken ve randevu saatini değiştirirken ortak kullanılır. */
export function TimeStep({
  days,
  date,
  onDate,
  time,
  onTime,
  data,
  loading,
  error,
  onRetry,
}: {
  days: string[]
  date: string
  onDate: (d: string) => void
  time: string | null
  onTime: (t: string) => void
  data: SlotsResponse | undefined
  loading: boolean
  error: boolean
  onRetry: () => void
}) {
  const stripRef = useRef<HTMLDivElement>(null)
  const monthFmt = useMemo(() => new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }), [])

  // Şerit, kullanıcı tıklayınca ASLA kaymaz (yakın bir günü seçince tarihler uzağa kaymasın; kaydırmak isteyen kendisi kaydırır).
  // Tek istisna: bu adım yeniden açıldığında (ör. "Geri"den dönünce) daha önce seçilmiş gün şeridin dışında kalıyorsa,
  // yalnızca görünür olacak kadar kaydırılır. Yalnızca ilk açılışta çalışır.
  useEffect(() => {
    const strip = stripRef.current
    const btn = strip?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!strip || !btn) return
    const viewRight = strip.scrollLeft + strip.clientWidth
    if (btn.offsetLeft + btn.offsetWidth > viewRight) strip.scrollTo({ left: btn.offsetLeft + btn.offsetWidth + 8 - strip.clientWidth, behavior: 'auto' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted">
        {monthFmt.format(parseISODateLocal(date))}
      </p>
      <div
        ref={stripRef}
        className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto overscroll-x-contain px-5 pb-1 md:mx-0 md:px-0"
        role="group"
        aria-label="Gün"
      >
        {days.map((d, i) => {
          const selected = d === date
          const dt = parseISODateLocal(d)
          return (
            <button
              key={d}
              type="button"
              aria-pressed={selected}
              onClick={() => onDate(d)}
              className={cn(
                'flex min-h-[76px] w-16 shrink-0 flex-col items-center justify-center rounded-md border transition-colors',
                selected
                  ? 'border-copper bg-copper text-on-accent'
                  : 'border-line bg-surface text-cream hover:border-line-strong active:bg-surface-raised',
              )}
            >
              <span className={cn('text-xs font-medium uppercase tracking-wider', selected ? 'text-on-accent/80' : 'text-muted')}>
                {i === 0 ? 'Bugün' : formatWeekdayShort(d)}
              </span>
              <span className="font-display text-2xl leading-none">{dt.getDate()}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-7 min-h-[22rem]">
        <p className="mb-4 text-sm text-muted-strong">{formatDateLong(date)}</p>
        {loading ? (
          <SlotGridSkeleton />
        ) : error || !data ? (
          <LoadError onRetry={onRetry} text="Müsait saatler yüklenemedi" />
        ) : (
          <SlotGrid data={data} value={time} onChange={onTime} />
        )}
      </div>
    </div>
  )
}
