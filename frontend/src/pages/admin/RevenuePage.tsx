import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChartColumn, ChevronLeft, ChevronRight, Table2, TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, IconButton } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input } from '../../components/ui/Input'
import { PageHeader } from '../../components/ui/PageHeader'
import { Select } from '../../components/ui/Select'
import { Skeleton } from '../../components/ui/Skeleton'
import { SegmentedControl } from '../../components/ui/Tabs'
import { adminApi } from '../../lib/api'
import { useStaffAuth } from '../../lib/auth'
import { addDaysISO, formatDateLong, formatMonthYear, formatNumber, formatPrice, fullName, parseISODateLocal, toLocalISO, todayLocalISO } from '../../lib/format'
import type { ReportPeriod, RevenueReport } from '../../types/api'
import { pointLabel, RankList, RevenueChart, RevenueTable, type RankItem } from './revenueParts'
import { ErrorBlock, qk, useStaffList } from './shared'

const PERIOD_ITEMS: { value: ReportPeriod; label: string }[] = [
  { value: 'day', label: 'Günlük' },
  { value: 'month', label: 'Aylık' },
  { value: 'year', label: 'Yıllık' },
]

const CURRENT_LABEL: Record<ReportPeriod, string> = { day: 'Bugün', month: 'Bu ay', year: 'Bu yıl' }
const PREV_LABEL: Record<ReportPeriod, string> = { day: 'dün', month: 'geçen ay', year: 'geçen yıl' }
const GROUP_LABEL: Record<ReportPeriod, string> = { day: 'Saate göre', month: 'Güne göre', year: 'Aya göre' }

function periodStart(period: ReportPeriod, iso: string): string {
  if (period === 'day') return iso
  return period === 'month' ? `${iso.slice(0, 7)}-01` : `${iso.slice(0, 4)}-01-01`
}

function shiftAnchor(period: ReportPeriod, iso: string, dir: 1 | -1): string {
  if (period === 'day') return addDaysISO(iso, dir)
  const d = parseISODateLocal(iso)
  return toLocalISO(period === 'month' ? new Date(d.getFullYear(), d.getMonth() + dir, 1) : new Date(d.getFullYear() + dir, 0, 1))
}

function rangeTitle(period: ReportPeriod, anchor: string): string {
  if (period === 'day') return formatDateLong(anchor)
  return period === 'month' ? formatMonthYear(anchor) : anchor.slice(0, 4)
}

export default function RevenuePage() {
  const { isManager } = useStaffAuth()
  const today = todayLocalISO()
  const [period, setPeriod] = useState<ReportPeriod>('month')
  const [anchor, setAnchor] = useState(today)
  const [staffId, setStaffId] = useState('')
  const [showTable, setShowTable] = useState(false)
  const staff = useStaffList()

  const query = useQuery({
    queryKey: [...qk.reports, period, anchor, isManager ? staffId : 'self'],
    queryFn: () => adminApi.getRevenueReport(period, anchor, isManager && staffId ? Number(staffId) : undefined),
    placeholderData: keepPreviousData,
  })
  const report = query.data

  const isCurrent = periodStart(period, anchor) === periodStart(period, today)
  const canNext = periodStart(period, shiftAnchor(period, anchor, 1)) <= today
  const staffName = staffId ? staff.data?.find((s) => String(s.id) === staffId) : undefined

  const years = useMemo(() => {
    const current = Number(today.slice(0, 4))
    const list = Array.from({ length: 6 }, (_, i) => current - i)
    const picked = Number(anchor.slice(0, 4))
    return list.includes(picked) ? list : [...list, picked].sort((a, b) => b - a)
  }, [today, anchor])

  function picker() {
    if (period === 'day')
      return <Input type="date" aria-label="Gün seç" max={today} value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} />
    if (period === 'month')
      return (
        <Input
          type="month"
          aria-label="Ay seç"
          max={today.slice(0, 7)}
          value={anchor.slice(0, 7)}
          onChange={(e) => e.target.value && setAnchor(`${e.target.value}-01`)}
        />
      )
    return (
      <Select aria-label="Yıl seç" value={anchor.slice(0, 4)} onChange={(e) => setAnchor(`${e.target.value}-01-01`)}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Yönetim"
        title="Gelir raporu"
        description={
          isManager
            ? 'Dükkânın gerçekleşen geliri. Yalnızca "tamamlandı" olarak işaretlenen randevular sayılır.'
            : 'Kendi gerçekleşen geliriniz. Yalnızca "tamamlandı" olarak işaretlenen randevular sayılır.'
        }
      />

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
        <SegmentedControl
          label="Rapor dönemi"
          items={PERIOD_ITEMS}
          value={period}
          onChange={(p) => {
            setPeriod(p)
            setAnchor((a) => (a > today ? today : a))
          }}
          className="self-start"
        />
        <div className="flex items-center gap-1.5">
          <IconButton label="Önceki dönem" onClick={() => setAnchor(shiftAnchor(period, anchor, -1))}>
            <ChevronLeft className="size-5" />
          </IconButton>
          <div className="w-44 sm:w-52">{picker()}</div>
          <IconButton label="Sonraki dönem" disabled={!canNext} onClick={() => setAnchor(shiftAnchor(period, anchor, 1))}>
            <ChevronRight className="size-5" />
          </IconButton>
          {!isCurrent && (
            <Button variant="ghost" size="sm" onClick={() => setAnchor(today)}>
              {CURRENT_LABEL[period]}
            </Button>
          )}
        </div>
        {isManager && (
          <div className="md:w-56">
            <Select aria-label="Personel filtresi" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">Tüm personel</option>
              {(staff.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {fullName(s)}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {query.isError && !report ? (
        <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />
      ) : !report ? (
        <div className="flex flex-col gap-5" role="status" aria-label="Yükleniyor">
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : (
        <div className={query.isFetching ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
          <Summary report={report} isCurrent={isCurrent} title={rangeTitle(period, anchor)} scope={staffName ? fullName(staffName) : isManager ? 'Tüm personel' : 'Sizin randevularınız'} />

          <Card className="mt-5">
            <CardHeader
              title="Gelir dağılımı"
              description={`${GROUP_LABEL[period]} · ${rangeTitle(period, anchor)}`}
              action={
                <Button variant="ghost" size="sm" onClick={() => setShowTable((v) => !v)} leftIcon={showTable ? <ChartColumn className="size-4" /> : <Table2 className="size-4" />}>
                  {showTable ? 'Grafiği göster' : 'Tablo olarak göster'}
                </Button>
              }
            />
            {report.completed_count === 0 ? (
              <EmptyState
                icon={<ChartColumn />}
                title="Bu dönemde tamamlanan randevu yok"
                description="Randevuları 'Tamamla' dediğinizde gelir burada görünür."
              />
            ) : showTable ? (
              <RevenueTable points={report.series} period={period} dateFrom={report.date_from} />
            ) : (
              <>
                <PeakCaption report={report} />
                <RevenueChart points={report.series} period={period} dateFrom={report.date_from} />
              </>
            )}
          </Card>

          <div className="mt-5 grid gap-5 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader title="Hizmet bazlı gelir" description="Hangi işten ne kadar kazanıldı" />
              {report.by_service.length === 0 ? (
                <p className="py-2 text-sm text-muted">Bu dönemde tamamlanan hizmet yok.</p>
              ) : (
                <RankList
                  items={report.by_service.map<RankItem>((s) => ({ key: s.service_id, label: s.name, count: s.count, revenue: s.revenue, share: s.share_pct }))}
                />
              )}
            </Card>

            <div className="flex min-w-0 flex-col gap-5 lg:col-span-2">
              <Card>
                <CardHeader title="Ödeme yöntemine göre" />
                {report.by_payment_method.length === 0 ? (
                  <p className="py-2 text-sm text-muted">Bu dönemde tamamlanan randevu yok.</p>
                ) : (
                  <RankList
                    items={report.by_payment_method.map<RankItem>((m) => ({
                      key: m.method ?? '_none',
                      label: m.method ?? 'Belirtilmedi',
                      count: m.count,
                      revenue: m.revenue,
                      share: report.revenue ? (m.revenue * 100) / report.revenue : 0,
                    }))}
                  />
                )}
              </Card>

              {isManager && !staffId && (
                <Card>
                  <CardHeader title="Personele göre" />
                  {report.by_staff.length === 0 ? (
                    <p className="py-2 text-sm text-muted">Bu dönemde tamamlanan randevu yok.</p>
                  ) : (
                    <RankList
                      items={report.by_staff.map<RankItem>((s) => ({
                        key: s.staff_id,
                        label: fullName(s),
                        count: s.count,
                        revenue: s.revenue,
                        share: report.revenue ? (s.revenue * 100) / report.revenue : 0,
                      }))}
                    />
                  )}
                </Card>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function PeakCaption({ report }: { report: RevenueReport }) {
  const peak = report.series.reduce((a, b) => (b.revenue > a.revenue ? b : a), report.series[0])
  if (!peak || peak.revenue <= 0) return null
  return (
    <p className="mb-3 text-sm text-muted">
      En yüksek: <span className="text-cream">{pointLabel(report.period, peak.key, report.date_from)}</span> ·{' '}
      <span className="tabular-nums text-cream">{formatPrice(peak.revenue)}</span>
    </p>
  )
}

function Summary({ report, isCurrent, title, scope }: { report: RevenueReport; isCurrent: boolean; title: string; scope: string }) {
  const prev = report.previous.revenue
  const diff = report.revenue - prev
  const pct = prev > 0 ? Math.round((diff * 1000) / prev) / 10 : null
  const up = diff >= 0

  return (
    <>
      <Card padding="lg">
        <p className="eyebrow">Gerçekleşen gelir</p>
        <p className="mt-4 text-5xl font-semibold tracking-tight text-cream md:text-6xl">{formatPrice(report.revenue)}</p>
        <p className="mt-2 text-sm text-muted">
          {title} · {scope}
        </p>
        <div className="mt-4 text-sm">
          {pct !== null ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={`inline-flex items-center gap-1 font-medium ${diff === 0 ? 'text-muted-strong' : up ? 'text-success' : 'text-danger'}`}>
                {diff === 0 ? null : up ? <TrendingUp className="size-4" aria-hidden="true" /> : <TrendingDown className="size-4" aria-hidden="true" />}
                {diff > 0 ? '+' : ''}%{new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(pct)}
              </span>
              <span className="text-muted">
                {PREV_LABEL[report.period]} {formatPrice(prev)}
              </span>
            </p>
          ) : report.revenue > 0 ? (
            <p className="text-muted">{PREV_LABEL[report.period][0].toLocaleUpperCase('tr-TR') + PREV_LABEL[report.period].slice(1)} gelir yoktu.</p>
          ) : null}
          {isCurrent && pct !== null && <p className="mt-1 text-xs text-muted">Dönem devam ediyor; önceki dönemin tamamıyla karşılaştırılıyor.</p>}
        </div>
      </Card>

      <dl className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Tamamlanan randevu" value={formatNumber(report.completed_count)} />
        <Tile label="Ortalama tutar" value={report.completed_count ? formatPrice(report.average_ticket) : '—'} hint="randevu başına" />
        <Tile label="İptal / gelmedi" value={`${formatNumber(report.cancelled_count)} / ${formatNumber(report.no_show_count)}`} hint="gelire dahil değil" />
        <Tile
          label="Tamamlanmayı bekleyen"
          value={formatNumber(report.open_count)}
          hint={report.open_count > 0 ? `${formatPrice(report.open_revenue)} · gelire dahil değil` : undefined}
          tone={report.open_count > 0 ? 'warning' : undefined}
        />
      </dl>
    </>
  )
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'warning' }) {
  return (
    <Card padding="sm" className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-1.5 text-2xl font-semibold tabular-nums ${tone === 'warning' ? 'text-warning' : 'text-cream'}`}>{value}</dd>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  )
}
