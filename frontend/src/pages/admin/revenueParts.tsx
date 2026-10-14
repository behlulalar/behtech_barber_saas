import { useState } from 'react'
import { cn } from '../../lib/cn'
import { formatNumber, formatPrice } from '../../lib/format'
import type { ReportPeriod, RevenueSeriesPoint } from '../../types/api'

const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
const MONTHS_LONG = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

const pad = (n: number) => String(n).padStart(2, '0')

/** Tooltip / tablo başlığı: "09:00 – 09:59", "15 Eylül", "Eylül 2026". */
export function pointLabel(period: ReportPeriod, key: number, dateFrom: string): string {
  const [year, month] = dateFrom.split('-').map(Number)
  if (period === 'day') return `${pad(key)}:00 – ${pad(key)}:59`
  if (period === 'month') return `${key} ${MONTHS_LONG[month - 1]}`
  return `${MONTHS_LONG[key - 1]} ${year}`
}

/** Eksen etiketi; ay görünümünde yalnızca 1, 5, 10... gösterilir ki etiketler çakışmasın. */
function axisLabel(period: ReportPeriod, key: number): string {
  if (period === 'day') return pad(key)
  if (period === 'month') return key === 1 || key % 5 === 0 ? String(key) : ''
  return MONTHS_SHORT[key - 1]
}

/** Ekseni "temiz" bir üst değere yuvarlar; 4 eşit aralık. */
function niceTop(max: number): number {
  if (max <= 0) return 100
  const exp = 10 ** Math.floor(Math.log10(max))
  const f = max / exp
  const nice = [1, 2, 3, 4, 5, 6, 8, 10].find((n) => f <= n) ?? 10
  return nice * exp
}

const PLOT_H = 'h-56'

/**
 * Tek seri sütun grafiği (yalnızca gelir). Tek renk, ince çubuk (<=24px), 4px yuvarlak uç;
 * üzerine gelince / dokununca değer gösterilir. Görsel, ekran okuyucular için `role="img"`;
 * ayrıntı değerleri tablo görünümünde de vardır.
 */
export function RevenueChart({ points, period, dateFrom }: { points: RevenueSeriesPoint[]; period: ReportPeriod; dateFrom: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const top = niceTop(Math.max(0, ...points.map((p) => p.revenue)))
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
            <span
              key={t}
              className="absolute right-2 translate-y-1/2 text-xs tabular-nums text-muted"
              style={{ bottom: `${(t / top) * 100}%` }}
            >
              {formatNumber(Math.round(t))}
            </span>
          ))}
        </div>

        <div className={cn('relative min-w-0 flex-1', PLOT_H)} role="img" aria-label="Gelir grafiği. Ayrıntılar için tablo görünümünü açın.">
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
                {p.revenue > 0 && (
                  <div
                    className={cn('w-full max-w-6 rounded-t-[4px] transition-colors', hover === i ? 'bg-copper-bright' : 'bg-copper')}
                    style={{ height: `max(2px, ${(p.revenue / top) * 100}%)` }}
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
              <p className="text-xs text-muted">{pointLabel(period, active.key, dateFrom)}</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-cream">{formatPrice(active.revenue)}</p>
              <p className="text-xs text-muted">{active.count > 0 ? `${formatNumber(active.count)} randevu` : 'Randevu yok'}</p>
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
              // Yıl görünümünde dar ekranda her iki aydan biri gösterilir.
              period === 'year' && i % 2 === 1 && 'max-sm:invisible',
            )}
          >
            {axisLabel(period, p.key)}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Grafiğin tablo karşılığı (klavye / ekran okuyucu / kesin değerler). */
export function RevenueTable({ points, period, dateFrom }: { points: RevenueSeriesPoint[]; period: ReportPeriod; dateFrom: string }) {
  return (
    <div className="max-h-96 overflow-y-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Döneme göre gelir</caption>
        <thead className="sticky top-0 bg-panel text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" className="py-2 pr-3 font-medium">Dönem</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Randevu</th>
            <th scope="col" className="py-2 pl-3 text-right font-medium">Gelir</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-panel-line">
          {points.map((p) => (
            <tr key={p.key} className={p.revenue === 0 ? 'text-muted' : 'text-cream'}>
              <th scope="row" className="py-2.5 pr-3 text-left font-normal">{pointLabel(period, p.key, dateFrom)}</th>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(p.count)}</td>
              <td className="py-2.5 pl-3 text-right tabular-nums">{formatPrice(p.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export interface RankItem {
  key: string | number
  label: string
  count: number
  revenue: number
  /** Toplam gelirdeki pay (0-100). */
  share: number
}

/** Sıralı yatay çubuklar: ad + tutar, altında ince çubuk (en yüksek olan tam dolu) ve randevu sayısı / pay. */
export function RankList({ items }: { items: RankItem[] }) {
  const max = Math.max(1, ...items.map((i) => i.revenue))
  return (
    <ul className="flex flex-col gap-4">
      {items.map((i) => (
        <li key={i.key} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm text-cream">{i.label}</span>
            <span className="shrink-0 text-sm font-medium tabular-nums text-cream">{formatPrice(i.revenue)}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel-raised" aria-hidden="true">
            <div className="h-full rounded-full bg-copper" style={{ width: `${Math.max(2, (i.revenue / max) * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">
            {formatNumber(i.count)} randevu · %{new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(i.share)}
          </p>
        </li>
      ))}
    </ul>
  )
}
