import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Store, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ColumnChart, ColumnTable, MONTHS_LONG, MONTHS_SHORT, type ColumnPoint } from '../../components/charts/ColumnChart'
import { Badge } from '../../components/ui/Badge'
import { Button, buttonStyles } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { StatCard } from '../../components/ui/StatCard'
import { errorMessage, platformApi } from '../../lib/api'
import { formatDateShort, formatNumber, formatPrice, formatTimestamp } from '../../lib/format'
import type { MetricsOverview } from '../../types/api'

function revenuePoints(m: MetricsOverview): ColumnPoint[] {
  return m.monthly_revenue.map((r) => {
    const [y, mo] = r.month.split('-').map(Number)
    return {
      key: r.month,
      value: r.revenue,
      axis: MONTHS_SHORT[mo - 1],
      title: `${MONTHS_LONG[mo - 1]} ${y}`,
      valueText: formatPrice(r.revenue),
    }
  })
}

function TenantLink({ id, children }: { id: number; children: string }) {
  return (
    <Link to={`/platform/isletmeler/${id}`} className="min-w-0 truncate font-medium text-cream hover:text-copper-bright hover:underline">
      {children}
    </Link>
  )
}

function BarRows({ rows, fmt }: { rows: { key: string | number; label: string; value: number; sub?: string }[]; fmt: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.key} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm text-cream">{r.label}</span>
            <span className="shrink-0 text-sm font-medium tabular-nums text-cream">{fmt(r.value)}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-panel-raised" aria-hidden="true">
            <div className="h-full rounded-full bg-copper" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
          {r.sub && <p className="mt-1 text-xs text-muted">{r.sub}</p>}
        </li>
      ))}
    </ul>
  )
}

function Muted({ children }: { children: string }) {
  return <p className="py-2 text-sm text-muted">{children}</p>
}

export default function DashboardPage() {
  const stats = useQuery({ queryKey: ['platform', 'stats'], queryFn: platformApi.getStats })
  const metrics = useQuery({ queryKey: ['platform', 'metrics'], queryFn: platformApi.getMetrics, staleTime: 60_000 })
  const tenants = useQuery({ queryKey: ['platform', 'tenants', 'recent'], queryFn: () => platformApi.listTenants({ limit: 5, sort: '-created' }) })
  const [showTable, setShowTable] = useState(false)

  const recent = tenants.data?.items ?? []
  const s = stats.data
  const m = metrics.data
  const inactive = s ? s.tenant_count - s.active_tenant_count : 0
  const summary = s
    ? `${formatNumber(s.tenant_count)} işletme (${formatNumber(inactive)} pasif) · ${formatNumber(s.total_appointments)} randevu · son 30 günde ${formatNumber(s.appointments_last_30_days)}`
    : 'Gelir, yenileme ve kullanım özeti.'
  const attentionCount = m ? m.at_risk.length + m.churned_last_30.length : 0

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Genel Bakış"
        description={summary}
        actions={
          <Link to="/platform/isletmeler" className={buttonStyles({ variant: 'secondary' })}>
            <Store className="size-4" aria-hidden="true" />
            İşletmeleri yönet
          </Link>
        }
      />

      {(stats.isError || metrics.isError) && (
        <p role="alert" className="mb-4 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {errorMessage(metrics.error ?? stats.error)}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-5">
        <StatCard label="MRR" value={m ? formatPrice(m.mrr) : ''} hint="aylık yinelenen gelir" tone="copper" loading={metrics.isLoading} className="col-span-2 lg:col-span-1" />
        <StatCard label="ARR" value={m ? formatPrice(m.arr) : ''} hint="MRR × 12" loading={metrics.isLoading} />
        <StatCard label="Ücretli işletme" value={m ? formatNumber(m.paying_tenants) : ''} tone="success" loading={metrics.isLoading} />
        <StatCard label="Aktif deneme" value={m ? formatNumber(m.trial_tenants) : ''} loading={metrics.isLoading} />
        <StatCard label="Bu ay tahsilat" value={m ? formatPrice(m.month_collected) : ''} loading={metrics.isLoading} className="col-span-2 lg:col-span-1" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Aylık tahsilat"
            description="Son 12 ay, ödeme tarihine göre."
            action={
              m && (
                <Button variant="ghost" size="sm" onClick={() => setShowTable((v) => !v)}>
                  {showTable ? 'Grafiği göster' : 'Tablo olarak göster'}
                </Button>
              )
            }
          />
          {metrics.isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : !m ? null : showTable ? (
            <ColumnTable points={revenuePoints(m)} caption="Aylara göre tahsilat" periodHeader="Ay" valueHeader="Tahsilat" />
          ) : (
            <ColumnChart points={revenuePoints(m)} ariaLabel="Aylık tahsilat grafiği." hideEveryOtherAxisOnMobile />
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Yenileme takvimi" description="Önümüzdeki 30 gün." />
          {metrics.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !m || m.renewals_next_30.length === 0 ? (
            <Muted>Önümüzdeki 30 günde biten dönem yok.</Muted>
          ) : (
            <ul className="max-h-72 divide-y divide-panel-line overflow-y-auto">
              {m.renewals_next_30.map((r) => (
                <li key={r.tenant_id} className="flex min-h-12 items-center justify-between gap-3 py-2">
                  <div className="flex min-w-0 flex-col">
                    <TenantLink id={r.tenant_id}>{r.tenant_name}</TenantLink>
                    <span className="text-xs text-muted">
                      {formatDateShort(r.end_date)} · {r.days_left === 0 ? 'bugün' : `${r.days_left} gün`}
                      {r.is_trial && ' · deneme'}
                    </span>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums text-cream">{r.amount_due > 0 ? formatPrice(r.amount_due) : '—'}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="Dikkat"
            description="Kullanımı düşen veya kaybedilen işletmeler."
            action={attentionCount > 0 ? <Badge tone="warning">{attentionCount}</Badge> : undefined}
          />
          {metrics.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !m || attentionCount === 0 ? (
            <Muted>Şu an dikkat gerektiren işletme yok.</Muted>
          ) : (
            <ul className="max-h-72 divide-y divide-panel-line overflow-y-auto">
              {m.churned_last_30.map((c) => (
                <li key={`c${c.tenant_id}`} className="flex items-center justify-between gap-3 py-2">
                  <TenantLink id={c.tenant_id}>{c.tenant_name}</TenantLink>
                  <Badge tone="danger">{c.reason}</Badge>
                </li>
              ))}
              {m.at_risk.map((a) => (
                <li key={`r${a.tenant_id}`} className="flex min-w-0 flex-col py-2">
                  <span className="flex items-center gap-2">
                    <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden="true" />
                    <TenantLink id={a.tenant_id}>{a.tenant_name}</TenantLink>
                  </span>
                  <span className="mt-0.5 text-xs text-muted">
                    {a.reason}
                    {a.last_appointment_date ? ` · son randevu ${formatDateShort(a.last_appointment_date)}` : ' · hiç randevu yok'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Plan dağılımı" description="Ücretli işletmeler, aylık gelire göre." />
          {metrics.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !m || m.plan_distribution.length === 0 ? (
            <Muted>Henüz ücretli abonelik yok.</Muted>
          ) : (
            <BarRows
              rows={m.plan_distribution.map((p) => ({ key: p.plan_name, label: p.plan_name, value: p.mrr, sub: `${formatNumber(p.tenants)} işletme` }))}
              fmt={formatPrice}
            />
          )}
        </Card>

        <Card>
          <CardHeader title="En çok kullanan" description="Son 30 günde randevu sayısı." />
          {metrics.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !m || m.top_usage.length === 0 ? (
            <Muted>Son 30 günde randevu yok.</Muted>
          ) : (
            <BarRows rows={m.top_usage.map((u) => ({ key: u.tenant_id, label: u.tenant_name, value: u.appointments_30d }))} fmt={(n) => `${formatNumber(n)} randevu`} />
          )}
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader
          title="Son eklenen işletmeler"
          description="En yeni beş kayıt."
          action={
            <Link to="/platform/isletmeler" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-copper-bright hover:underline">
              Tümünü gör <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          }
        />
        {tenants.isLoading ? (
          <div className="flex flex-col gap-2" role="status" aria-label="Yükleniyor">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : tenants.isError ? (
          <p role="alert" className="text-sm text-danger">
            {errorMessage(tenants.error)}
          </p>
        ) : recent.length === 0 ? (
          <EmptyState
            icon={<Store />}
            title="Henüz işletme yok"
            description="İlk işletmeyi ekleyerek başlayın."
            action={
              <Link to="/platform/isletmeler" className={buttonStyles({ variant: 'primary' })}>
                İşletme ekle
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-panel-line">
            {recent.map((t) => (
              <li key={t.id} className="flex min-h-16 items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-cream">{t.name}</p>
                  <p className="truncate text-xs text-muted">
                    {t.slug}.behtechlabs.com · {formatTimestamp(t.created_at)}
                  </p>
                </div>
                <Badge tone={t.is_active ? 'success' : 'neutral'}>{t.is_active ? 'Aktif' : 'Pasif'}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
