// Kayıt başvuruları: yeni kayıt olan işletmelerin onay bekleme listesi (kart görünümü).
import { useQuery } from '@tanstack/react-query'
import { BASE_DOMAIN } from '../../lib/site'
import { Clock, ExternalLink, Inbox, Phone, User } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { Tabs } from '../../components/ui/Tabs'
import { errorMessage, platformApi } from '../../lib/api'
import { formatPhone, formatTimestamp } from '../../lib/format'
import type { PlatformTenant } from '../../types/api'
import { ReviewActions } from './SignupReviewCard'

type Filter = 'pending' | 'rejected'

function ApplicationCard({ t, filter }: { t: PlatformTenant; filter: Filter }) {
  return (
    <li className="rounded-md border border-panel-line bg-panel p-4 md:p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/platform/isletmeler/${t.id}`} className="font-display text-lg font-medium text-cream hover:text-copper-bright">
              {t.name}
            </Link>
            {filter === 'pending' ? <Badge tone="warning">Onay bekliyor</Badge> : <Badge tone="danger">Reddedildi</Badge>}
          </div>
          <p className="mt-1 break-all text-sm text-muted">{t.slug}.{BASE_DOMAIN}</p>

          <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
            <div className="flex items-center gap-2 text-muted-strong">
              <User className="size-4 shrink-0 text-muted" aria-hidden="true" />
              <dt className="sr-only">Sahip</dt>
              <dd className="min-w-0 truncate text-cream">{t.owner_name ?? '—'}</dd>
            </div>
            <div className="flex items-center gap-2 text-muted-strong">
              <Phone className="size-4 shrink-0 text-muted" aria-hidden="true" />
              <dt className="sr-only">Telefon</dt>
              <dd className="flex min-w-0 flex-wrap items-center gap-x-3">
                {t.owner_phone ? (
                  <>
                    <a href={`tel:0${t.owner_phone}`} className="inline-flex min-h-11 items-center whitespace-nowrap tabular-nums text-cream hover:text-copper-bright md:pointer-fine:min-h-0">
                      {formatPhone(t.owner_phone)}
                    </a>
                    <a
                      href={`https://wa.me/90${t.owner_phone}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center gap-1 text-copper-bright hover:underline md:pointer-fine:min-h-0"
                    >
                      WhatsApp <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  </>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div className="flex items-center gap-2 text-muted-strong">
              <Clock className="size-4 shrink-0 text-muted" aria-hidden="true" />
              <dt className="sr-only">Başvuru tarihi</dt>
              <dd className="text-cream">{formatTimestamp(t.created_at)}</dd>
            </div>
          </dl>
        </div>
        {filter === 'pending' && <ReviewActions tenant={t} className="flex shrink-0 flex-wrap gap-2 md:flex-col" />}
      </div>
    </li>
  )
}

export default function ApplicationsPage() {
  const [filter, setFilter] = useState<Filter>('pending')
  const q = useQuery({
    queryKey: ['platform', 'tenants', 'applications', filter],
    queryFn: () => platformApi.listTenants({ status: filter, sort: '-created', limit: 100 }),
  })
  const items = q.data?.items ?? []

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Başvurular"
        description="Ücretsiz dene formundan kayıt olan işletmeler. Onayladığınız işletme 14 günlük deneme olarak başlar."
      />
      <div className="mb-5">
        <Tabs
          label="Başvuru durumu"
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          items={[
            { value: 'pending', label: 'Bekleyen' },
            { value: 'rejected', label: 'Reddedilen' },
          ]}
        />
      </div>

      {q.isError ? (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {errorMessage(q.error)}
        </p>
      ) : q.isLoading ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Yükleniyor">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title={filter === 'pending' ? 'Bekleyen başvuru yok' : 'Reddedilen başvuru yok'}
          description={filter === 'pending' ? 'Yeni bir işletme kayıt olduğunda burada görünür ve size bildirim gelir.' : undefined}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((t) => (
            <ApplicationCard key={t.id} t={t} filter={filter} />
          ))}
        </ul>
      )}
    </>
  )
}
