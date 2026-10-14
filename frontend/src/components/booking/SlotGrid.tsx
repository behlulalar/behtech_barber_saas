import { CalendarX2, CloudSun, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '../../lib/cn'
import type { Slot, SlotsResponse } from '../../types/api'
import { Skeleton } from '../ui/Skeleton'

/**
 * 30 dakikalık slot ızgarası (müşteri randevu sayfası + panel yeni randevu modalı).
 * Seçilen değer her zaman başlangıç saatidir ("HH:MM"); hizmet n slot sürüyorsa
 * başlangıç + sonraki n-1 slot birlikte vurgulanır.
 */

interface Group {
  key: 'morning' | 'noon' | 'evening'
  label: string
  Icon: LucideIcon
  slots: Slot[]
}

const GROUP_DEFS: Omit<Group, 'slots'>[] = [
  { key: 'morning', label: 'Sabah', Icon: Sun },
  { key: 'noon', label: 'Öğle', Icon: CloudSun },
  { key: 'evening', label: 'Akşam', Icon: Moon },
]

function groupKey(start: string): Group['key'] {
  const h = Number(start.slice(0, 2))
  if (h < 12) return 'morning'
  if (h < 17) return 'noon'
  return 'evening'
}

function colsClass(maxColumns: 3 | 4) {
  return maxColumns === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
}

const CELL = 'min-h-14 rounded-sm'

export interface SlotGridProps {
  data: SlotsResponse
  /** Seçili başlangıç ("HH:MM") ya da null. */
  value: string | null
  onChange: (start: string) => void
  /** Panel modalı gibi dar alanlarda 3. */
  maxColumns?: 3 | 4
  /** Geçmiş saatleri hiç gösterme (varsayılan). Bugün için ekranın yarısı "Geçti" ile dolmasın. */
  hidePast?: boolean
  className?: string
}

export function SlotGrid({ data, value, onChange, maxColumns = 4, hidePast = true, className }: SlotGridProps) {
  const [hover, setHover] = useState<string | null>(null)
  const n = Math.max(1, data.duration_slots)

  const indexByStart = useMemo(() => new Map(data.slots.map((s, i) => [s.start, i])), [data.slots])
  const rangeOf = (start: string | null): Set<string> => {
    const out = new Set<string>()
    if (!start) return out
    const i = indexByStart.get(start)
    if (i == null) return out
    for (let k = 0; k < n && i + k < data.slots.length; k++) out.add(data.slots[i + k].start)
    return out
  }
  const selected = rangeOf(value)
  const preview = rangeOf(hover)

  const groups = useMemo<Group[]>(
    () =>
      GROUP_DEFS.map((g) => ({
        ...g,
        slots: data.slots.filter((s) => groupKey(s.start) === g.key && !(hidePast && s.status === 'past')),
      })).filter((g) => g.slots.length > 0),
    [data.slots, hidePast],
  )

  const bookableCount = data.slots.filter((s) => s.bookable).length
  const selectedSlot = value ? data.slots[indexByStart.get(value) ?? -1] : undefined
  const endSlot = selectedSlot ? data.slots[(indexByStart.get(selectedSlot.start) ?? 0) + n - 1] : undefined

  if (data.closed_reason || groups.length === 0) {
    const text =
      data.closed_reason === 'day_off'
        ? 'Bu gün çalışmıyor'
        : data.closed_reason === 'time_off'
          ? 'Berber bu tarihte izinli'
          : 'Bu gün için boş saat kalmadı — başka bir gün seçin'
    return <ClosedNotice text={text} className={className} />
  }

  return (
    <div className={cn('space-y-6', className)}>
      {bookableCount === 0 && (
        <p role="status" className="flex items-start gap-2 text-sm text-warning">
          <CalendarX2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Bu gün için boş saat kalmadı — başka bir gün seçin
        </p>
      )}
      <div role="radiogroup" aria-label="Saat" className="space-y-6" onPointerLeave={() => setHover(null)}>
        {groups.map(({ key, label, Icon, slots }) => {
          const free = slots.filter((s) => s.bookable).length
          return (
            <section key={key} aria-label={label}>
              <h3 className="mb-2.5 flex items-center gap-2 text-sm font-medium text-muted-strong">
                <Icon className="size-4 text-copper" aria-hidden="true" />
                <span>{label}</span>
                <span className="text-xs font-normal text-muted">· {free} müsait</span>
              </h3>
              <div className={cn('grid gap-2', colsClass(maxColumns))}>
                {slots.map((s) => (
                  <SlotCell
                    key={s.start}
                    slot={s}
                    n={n}
                    isStart={s.start === value}
                    inRange={selected.has(s.start)}
                    inPreview={s.start !== value && preview.has(s.start) && !selected.has(s.start)}
                    onPick={() => onChange(s.start)}
                    onHover={(on) => setHover(on ? s.start : null)}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>
      <p aria-live="polite" className="min-h-5 text-sm text-muted-strong">
        {selectedSlot && endSlot && (
          <>
            <span className="font-medium tabular-nums text-cream">
              {selectedSlot.start} – {endSlot.end}
            </span>
            {' · '}
            {n} slot
          </>
        )}
      </p>
    </div>
  )
}

function SlotCell({
  slot,
  n,
  isStart,
  inRange,
  inPreview,
  onPick,
  onHover,
}: {
  slot: Slot
  n: number
  isStart: boolean
  inRange: boolean
  inPreview: boolean
  onPick: () => void
  onHover: (on: boolean) => void
}) {
  const time = (
    <span className="font-display text-base tabular-nums leading-tight">
      {slot.start} – {slot.end}
    </span>
  )

  if (!slot.bookable) {
    const tooShort = slot.status === 'free'
    const label = slot.status === 'busy' ? 'Dolu' : slot.status === 'past' ? 'Geçti' : 'Süre yetmez'
    // Seçili aralığın devamı olan (bookable olmayabilen) slotlar vurgulu kalır.
    if (inRange) {
      return (
        <div
          role="radio"
          aria-checked={false}
          aria-disabled="true"
          className={cn(CELL, 'flex flex-col items-center justify-center border border-copper/60 bg-copper/20 px-1 text-copper-bright')}
        >
          {time}
          <span className="text-xs">Süre içinde</span>
        </div>
      )
    }
    return (
      <div
        role="radio"
        aria-checked={false}
        aria-disabled="true"
        title={tooShort ? `Bu hizmet ${n} slot sürüyor` : undefined}
        className={cn(
          CELL,
          'flex cursor-not-allowed flex-col items-center justify-center border border-line/70 bg-transparent px-1',
          tooShort ? 'text-muted/60' : 'text-muted',
        )}
      >
        <span className={cn('font-display text-base tabular-nums leading-tight', slot.status === 'busy' && 'line-through decoration-muted/50')}>
          {slot.start} – {slot.end}
        </span>
        <span className={cn('text-xs', slot.status === 'busy' ? 'font-medium text-danger' : 'text-muted/80')}>{label}</span>
      </div>
    )
  }

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isStart}
      onClick={onPick}
      onPointerEnter={(e) => e.pointerType === 'mouse' && onHover(true)}
      onPointerLeave={() => onHover(false)}
      className={cn(
        CELL,
        'flex flex-col items-center justify-center border px-1 transition-colors',
        isStart
          ? 'border-copper bg-copper text-ink'
          : inRange
            ? 'border-copper/60 bg-copper/20 text-copper-bright'
            : inPreview
              ? 'border-dashed border-copper bg-copper/10 text-cream'
              : 'border-line bg-surface text-cream hover:border-copper/70 active:bg-surface-raised',
      )}
    >
      {time}
      <span className={cn('text-xs', isStart ? 'text-ink/80' : inRange ? 'text-copper-bright/80' : 'text-muted')}>
        {isStart ? 'Seçili' : inRange ? 'Süre içinde' : 'Müsait'}
      </span>
    </button>
  )
}

function ClosedNotice({ text, className }: { text: string; className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        'flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line px-4 py-8 text-center',
        className,
      )}
    >
      <CalendarX2 className="size-6 text-muted" aria-hidden="true" />
      <p className="text-sm text-muted-strong">{text}</p>
    </div>
  )
}

/** Yüklenirken ızgaranın kapladığı yeri tutar (yerleşim kayması olmasın). */
export function SlotGridSkeleton({ maxColumns = 4, className }: { maxColumns?: 3 | 4; className?: string }) {
  return (
    <div className={cn('space-y-6', className)} role="status" aria-label="Müsait saatler yükleniyor">
      {[0, 1].map((g) => (
        <div key={g}>
          <Skeleton className="mb-2.5 h-5 w-28" />
          <div className={cn('grid gap-2', colsClass(maxColumns))}>
            {Array.from({ length: maxColumns === 3 ? 6 : 8 }, (_, i) => (
              <Skeleton key={i} className={cn(CELL, 'min-h-14')} />
            ))}
          </div>
        </div>
      ))}
      <div className="min-h-5" />
    </div>
  )
}
