// Genel Bakış'ın en üstü: "Bugün ne yapmalıyım?" — başvuru, ödeme, WhatsApp ve okunmayan acil bildirimler tek listede.
import { useQuery } from '@tanstack/react-query'
import { Bell, CheckCircle2, CreditCard, HeartPulse, LifeBuoy, MessageCircle, Moon, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { cn } from '../../lib/cn'
import { errorMessage, platformApi } from '../../lib/api'
import type { ActionItem } from '../../types/api'

const ICONS = { signup: UserPlus, billing: CreditCard, whatsapp: MessageCircle, notification: Bell, system: HeartPulse, activity: Moon, support: LifeBuoy } as const
const SHOWN = 6

function Row({ item }: { item: ActionItem }) {
  const Icon = ICONS[item.category]
  const high = item.severity === 'high'
  return (
    <li>
      <Link
        to={item.link}
        className="flex min-h-14 items-center gap-3 rounded-sm px-2 py-2.5 transition-colors hover:bg-panel-raised"
      >
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', high ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning')}>
          <Icon className="size-[18px]" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-medium text-cream">
            {item.tenant_name ? `${item.tenant_name} — ` : ''}
            {item.title}
          </span>
          {item.detail && <span className="block break-words text-xs text-muted-strong">{item.detail}</span>}
        </span>
        <Badge tone={high ? 'danger' : item.severity === 'low' ? 'neutral' : 'warning'}>{high ? 'Acil' : item.severity === 'low' ? 'Bilgi' : 'Yakında'}</Badge>
      </Link>
    </li>
  )
}

export function ActionQueueCard() {
  const q = useQuery({ queryKey: ['platform', 'actions'], queryFn: platformApi.getActions, staleTime: 30_000, refetchInterval: 120_000, retry: false })
  const [all, setAll] = useState(false)
  const d = q.data
  const items = d ? (all ? d.items : d.items.slice(0, SHOWN)) : []
  return (
    <Card className="mb-6">
      <CardHeader
        title="Bugün ne yapmalıyım?"
        description={d ? (d.total === 0 ? 'Bekleyen iş yok.' : `${d.total} madde${d.high > 0 ? `, ${d.high} acil` : ''}.`) : undefined}
      />
      {q.isError ? (
        <p role="alert" className="text-sm text-danger">{errorMessage(q.error)}</p>
      ) : !d ? (
        <Skeleton className="h-24 w-full" />
      ) : d.total === 0 ? (
        <p className="flex items-center gap-2.5 text-sm text-muted-strong">
          <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
          Her şey yolunda: onay bekleyen başvuru, ödeme sorunu, kopan WhatsApp ya da sistem uyarısı yok.
        </p>
      ) : (
        <>
          <ul className="-mx-2 divide-y divide-panel-line">
            {items.map((i) => (
              <Row key={i.key} item={i} />
            ))}
          </ul>
          {d.total > SHOWN && (
            <div className="mt-3">
              <Button variant="ghost" size="sm" onClick={() => setAll((v) => !v)}>
                {all ? 'Daha az göster' : `Tümünü göster (${d.total})`}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  )
}
