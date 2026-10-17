// İşletme paneli bildirim kutusu: platformdan gelen duyurular, özel mesajlar ve sistem uyarıları.
import { Bell, CheckCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { cn } from '../../lib/cn'
import { useInbox, useMarkRead } from '../../lib/inbox'
import { errorMessage } from '../../lib/api'
import { formatDateTimeDMY } from '../platform/platformShared'

const LEVEL: Record<string, { label: string; tone: BadgeTone }> = {
  info: { label: 'Bilgi', tone: 'neutral' },
  warning: { label: 'Uyarı', tone: 'warning' },
  critical: { label: 'Acil', tone: 'danger' },
}

export default function NotificationsPage() {
  const q = useInbox()
  const markRead = useMarkRead()
  const items = q.data?.items ?? []
  const unread = q.data?.unread ?? 0

  return (
    <>
      <PageHeader
        title="Bildirimler"
        description="Bakım duyuruları, bizden gelen mesajlar ve sistem uyarıları burada saklanır."
        actions={
          unread > 0 ? (
            <Button variant="secondary" onClick={() => markRead.mutate('all')} loading={markRead.isPending}>
              <CheckCheck className="size-4" aria-hidden="true" />
              Tümünü okundu say
            </Button>
          ) : undefined
        }
      />
      {q.isError ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-sm text-danger">{errorMessage(q.error)}</p>
          <Button variant="secondary" onClick={() => void q.refetch()}>Tekrar dene</Button>
        </div>
      ) : q.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : items.length === 0 ? (
        <EmptyState icon={<Bell className="size-6" aria-hidden="true" />} title="Bildirim yok" description="Yeni bir duyuru ya da uyarı geldiğinde burada görünür." />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((i) => {
            const lv = LEVEL[i.level] ?? LEVEL.info
            return (
              <li key={i.key}>
                <Card className={cn(!i.read && 'border-copper/50')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={lv.tone}>{lv.label}</Badge>
                    {!i.read && <Badge tone="info">Yeni</Badge>}
                    <span className="text-xs tabular-nums text-muted">{formatDateTimeDMY(i.created_at)}</span>
                  </div>
                  <p className="mt-2 break-words font-medium text-cream">{i.title}</p>
                  <p className="mt-1 whitespace-pre-line break-words text-sm text-muted-strong">{i.body}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {i.link && (
                      <Link to={i.link} className="inline-flex min-h-11 items-center text-sm font-medium text-copper-bright hover:underline">
                        Git
                      </Link>
                    )}
                    {!i.read && (
                      <Button variant="secondary" size="sm" onClick={() => markRead.mutate([i.key])} disabled={markRead.isPending}>
                        Okundu say
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
