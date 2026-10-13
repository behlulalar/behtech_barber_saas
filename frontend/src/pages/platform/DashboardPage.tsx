import { useQuery } from '@tanstack/react-query'
import { ArrowRight, BadgeCheck, CalendarCheck, CalendarClock, Store } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '../../components/ui/Badge'
import { buttonStyles } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { StatCard } from '../../components/ui/StatCard'
import { errorMessage, platformApi } from '../../lib/api'
import { formatNumber, formatTimestamp } from '../../lib/format'

export default function DashboardPage() {
  const stats = useQuery({ queryKey: ['platform', 'stats'], queryFn: platformApi.getStats })
  const tenants = useQuery({ queryKey: ['platform', 'tenants'], queryFn: platformApi.listTenants })

  const recent = [...(tenants.data ?? [])]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5)
  const s = stats.data
  const inactive = s ? s.tenant_count - s.active_tenant_count : 0

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Genel Bakış"
        description="Platformdaki işletmelerin ve randevu hacminin özeti."
        actions={
          <Link to="/platform/isletmeler" className={buttonStyles({ variant: 'secondary' })}>
            <Store className="size-4" aria-hidden="true" />
            İşletmeleri yönet
          </Link>
        }
      />

      {stats.isError && (
        <p role="alert" className="mb-4 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {errorMessage(stats.error)}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 md:gap-4">
        <StatCard
          label="İşletme"
          value={s ? formatNumber(s.tenant_count) : ''}
          hint={s ? `${formatNumber(inactive)} pasif` : undefined}
          icon={<Store />}
          loading={stats.isLoading}
        />
        <StatCard
          label="Aktif işletme"
          value={s ? formatNumber(s.active_tenant_count) : ''}
          tone="success"
          icon={<BadgeCheck />}
          loading={stats.isLoading}
        />
        <StatCard
          label="Toplam randevu"
          value={s ? formatNumber(s.total_appointments) : ''}
          icon={<CalendarCheck />}
          loading={stats.isLoading}
        />
        <StatCard
          label="Son 30 gün"
          value={s ? formatNumber(s.appointments_last_30_days) : ''}
          hint="randevu"
          tone="copper"
          icon={<CalendarClock />}
          loading={stats.isLoading}
        />
      </div>

      <Card className="mt-6 md:mt-8">
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
