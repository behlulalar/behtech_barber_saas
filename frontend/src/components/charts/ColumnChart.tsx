import { useState } from 'react'
import { cn } from '../../lib/cn'
import { formatNumber } from '../../lib/format'

export const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
export const MONTHS_LONG = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

export interface ColumnPoint {
  key: string | number
  /** Değer (tek seri). */
  value: number
  /** Alt eksen etiketi ('' = gösterme). */
  axis: string
  /** Tooltip / tablo satır başlığı. */
  title: string
  /** Tooltip'te değerin biçimli hali. */
  valueText: string
  /** Tooltip'te ikinci satır. */
  sub?: string
}

/** Ekseni "temiz" bir üst değere yuvarlar; 4 eşit aralık. */
export function niceTop(max: number): number {
  if (max <= 0) return 100
  const exp = 10 ** Math.floor(Math.log10(max))
  const f = max / exp
  const nice = [1, 2, 3, 4, 5, 6, 8, 10].find((n) => f <= n) ?? 10
  return nice * exp
}

const PLOT_H = 'h-56'

/**
 * Tek seri sütun grafiği. Tek renk, ince çubuk (<=24px), 4px yuvarlak uç;
 * üzerine gelince / dokununca değer gösterilir. Görsel `role="img"`; kesin değerler tablo görünümünde de vardır.
 */
export function ColumnChart({
  points,
  ariaLabel,
  hideEveryOtherAxisOnMobile = false,
}: {
  points: ColumnPoint[]
  ariaLabel: string
  hideEveryOtherAxisOnMobile?: boolean
}) {
  const [hover, setHover] = useState<number | null>(null)
  const top = niceTop(Math.max(0, ...points.map((p) => p.value)))
  const ticks = [0, 1, 2, 3, 4].map((i) => (top * i) / 4)
  const n = points.length
  const active = hover !== null ? points[hover] : null

  // Tooltip kenarlardan taşmasın: soldaki sütunlarda sağa, sağdakilerde sola doğru açılır.
  const tipShift = hover === null ? '-50%' : hover < n * 0.2 ? '0%' : hover > n * 0.8 ? '-100%' : '-50%'

  return (
    <div>
      <div className="flex">
        <div className={cn('relative w-12 shrink-0', PLOT_H)} aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="absolute right-2 translate-y-1/2 text-xs tabular-nums text-muted" style={{ bottom: `${(t / top) * 100}%` }}>
              {formatNumber(Math.round(t))}
            </span>
          ))}
        </div>

        <div className={cn('relative min-w-0 flex-1', PLOT_H)} role="img" aria-label={`${ariaLabel} Ayrıntılar için tablo görünümünü açın.`}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-panel-line" style={{ bottom: `${(t / top) * 100}%` }} aria-hidden="true" />
          ))}

          <div className="absolute inset-0 flex items-end" onPointerLeave={() => setHover(null)}>
            {points.map((p, i) => (
              <div
                key={p.key}
                className={cn('flex h-full min-w-0 flex-1 cursor-default items-end justify-center px-px transition-colors', hover === i && 'bg-cream/5')}
                onPointerEnter={() => setHover(i)}
                onClick={() => setHover((h) => (h === i ? null : i))}
              >
                {p.value > 0 && (
                  <div
                    className={cn('w-full max-w-6 rounded-t-[4px] transition-colors', hover === i ? 'bg-copper-bright' : 'bg-copper')}
                    style={{ height: `max(2px, ${(p.value / top) * 100}%)` }}
                  />
                )}
              </div>
            ))}
          </div>

          {active && (
            <div
              className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-sm border border-line-strong bg-ink px-3 py-2 shadow-lg"
              style={{ left: `${((hover! + 0.5) / n) * 100}%`, transform: `translateX(${tipShift})` }}
            >
              <p className="text-xs text-muted">{active.title}</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-cream">{active.valueText}</p>
              {active.sub && <p className="text-xs text-muted">{active.sub}</p>}
            </div>
          )}
        </div>
      </div>

      <div className="flex pl-12" aria-hidden="true">
        {points.map((p, i) => (
          <span
            key={p.key}
            className={cn(
              'mt-2 min-w-0 flex-1 overflow-visible text-center text-xs whitespace-nowrap text-muted',
              hideEveryOtherAxisOnMobile && i % 2 === 1 && 'max-sm:invisible',
            )}
          >
            {p.axis}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Grafiğin tablo karşılığı (klavye / ekran okuyucu / kesin değerler). */
export function ColumnTable({
  points,
  caption,
  periodHeader,
  valueHeader,
  extraHeader,
  extra,
}: {
  points: ColumnPoint[]
  caption: string
  periodHeader: string
  valueHeader: string
  extraHeader?: string
  extra?: (p: ColumnPoint) => string
}) {
  return (
    <div className="max-h-96 overflow-y-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-panel text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" className="py-2 pr-3 font-medium">{periodHeader}</th>
            {extraHeader && <th scope="col" className="px-3 py-2 text-right font-medium">{extraHeader}</th>}
            <th scope="col" className="py-2 pl-3 text-right font-medium">{valueHeader}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-panel-line">
          {points.map((p) => (
            <tr key={p.key} className={p.value === 0 ? 'text-muted' : 'text-cream'}>
              <th scope="row" className="py-2.5 pr-3 text-left font-normal">{p.title}</th>
              {extra && <td className="px-3 py-2.5 text-right tabular-nums">{extra(p)}</td>}
              <td className="py-2.5 pl-3 text-right tabular-nums">{p.valueText}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
