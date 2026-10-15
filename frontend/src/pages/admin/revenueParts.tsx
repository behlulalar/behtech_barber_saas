import { ColumnChart, ColumnTable, MONTHS_LONG, MONTHS_SHORT, type ColumnPoint } from '../../components/charts/ColumnChart'
import { formatNumber, formatPrice } from '../../lib/format'
import type { ReportPeriod, RevenueSeriesPoint } from '../../types/api'

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

function toPoints(points: RevenueSeriesPoint[], period: ReportPeriod, dateFrom: string): ColumnPoint[] {
  return points.map((p) => ({
    key: p.key,
    value: p.revenue,
    axis: axisLabel(period, p.key),
    title: pointLabel(period, p.key, dateFrom),
    valueText: formatPrice(p.revenue),
    sub: p.count > 0 ? `${formatNumber(p.count)} randevu` : 'Randevu yok',
  }))
}

/** Gelir sütun grafiği (ortak ColumnChart üzerinde). */
export function RevenueChart({ points, period, dateFrom }: { points: RevenueSeriesPoint[]; period: ReportPeriod; dateFrom: string }) {
  // Yıl görünümünde dar ekranda her iki aydan biri gösterilir.
  return <ColumnChart points={toPoints(points, period, dateFrom)} ariaLabel="Gelir grafiği." hideEveryOtherAxisOnMobile={period === 'year'} />
}

/** Grafiğin tablo karşılığı (klavye / ekran okuyucu / kesin değerler). */
export function RevenueTable({ points, period, dateFrom }: { points: RevenueSeriesPoint[]; period: ReportPeriod; dateFrom: string }) {
  const pts = toPoints(points, period, dateFrom)
  const counts = new Map(points.map((p) => [p.key, p.count]))
  return (
    <ColumnTable
      points={pts}
      caption="Döneme göre gelir"
      periodHeader="Dönem"
      extraHeader="Randevu"
      extra={(p) => formatNumber(counts.get(p.key as number) ?? 0)}
      valueHeader="Gelir"
    />
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
