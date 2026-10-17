// Platform: işletmelerden gelen destek talepleri. Yanıt işletmenin bildirim kutusuna düşer ve talep kapanır.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LifeBuoy } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { Tabs } from '../../components/ui/Tabs'
import { Textarea } from '../../components/ui/Textarea'
import { useToast } from '../../components/ui/Toast'
import { errorMessage, platformApi } from '../../lib/api'
import { formatPhone } from '../../lib/format'
import type { PlatformSupportTicket, SupportCategory } from '../../types/api'
import { formatDateTimeDMY } from './platformShared'

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = { whatsapp: 'WhatsApp', appointments: 'Randevular', payment: 'Ödeme', other: 'Diğer' }

function TicketCard({ t }: { t: PlatformSupportTicket }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const done = () => void qc.invalidateQueries({ queryKey: ['platform', 'support'] })
  const reply = useMutation({
    mutationFn: () => platformApi.replySupport(t.id, text.trim()),
    onSuccess: () => {
      toast.success('Yanıt işletmenin bildirimlerine gönderildi')
      done()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const close = useMutation({
    mutationFn: () => platformApi.closeSupport(t.id),
    onSuccess: () => {
      toast.success('Talep kapatıldı')
      done()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <Link to={`/platform/isletmeler/${t.tenant_id}`} className="font-medium text-cream hover:text-copper-bright hover:underline">{t.tenant_name}</Link>
        <Badge tone="neutral">{SUPPORT_CATEGORY_LABELS[t.category]}</Badge>
        <Badge tone={t.status === 'open' ? 'warning' : 'success'}>{t.status === 'open' ? 'Açık' : 'Kapalı'}</Badge>
        <span className="text-xs tabular-nums text-muted">{formatDateTimeDMY(t.created_at)}</span>
      </div>
      {(t.staff_name || t.staff_phone) && (
        <p className="mt-1 text-xs text-muted">
          {t.staff_name}{t.staff_phone ? ` · ${formatPhone(t.staff_phone)}` : ''}
        </p>
      )}
      <p className="mt-3 whitespace-pre-line break-words text-sm text-cream">{t.message}</p>
      {t.status === 'open' ? (
        <div className="mt-4 flex flex-col gap-3">
          <Textarea rows={3} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="Yanıtınız işletmenin Bildirimler sayfasına düşer" aria-label="Yanıt" />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => reply.mutate()} loading={reply.isPending} disabled={!text.trim()}>
              Yanıtla ve kapat
            </Button>
            <Button variant="secondary" onClick={() => close.mutate()} loading={close.isPending}>
              Yanıtsız kapat
            </Button>
          </div>
        </div>
      ) : (
        t.reply && (
          <div className="mt-4 rounded-sm border border-panel-line bg-panel-raised p-3 text-sm">
            <p className="text-xs text-muted">Yanıtınız{t.closed_at ? ` · ${formatDateTimeDMY(t.closed_at)}` : ''}</p>
            <p className="mt-1 whitespace-pre-line break-words text-cream">{t.reply}</p>
          </div>
        )
      )}
    </Card>
  )
}

export default function SupportPage() {
  const [status, setStatus] = useState<'open' | 'closed'>('open')
  const q = useQuery({ queryKey: ['platform', 'support', status], queryFn: () => platformApi.listSupport(status), refetchInterval: 60_000, retry: false })
  return (
    <>
      <PageHeader eyebrow="Platform" title="Destek" description="İşletmelerin panelden yazdığı talepler." />
      <Tabs
        label="Durum"
        value={status}
        onChange={setStatus}
        items={[{ value: 'open', label: 'Açık' }, { value: 'closed', label: 'Kapalı' }]}
        className="mb-5"
      />
      {q.isError ? (
        <p role="alert" className="text-sm text-danger">{errorMessage(q.error)}</p>
      ) : q.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (q.data ?? []).length === 0 ? (
        <EmptyState icon={<LifeBuoy className="size-6" aria-hidden="true" />} title={status === 'open' ? 'Açık talep yok' : 'Kapalı talep yok'} description="İşletmeler panelden yazdığında burada görünür." />
      ) : (
        <div className="flex flex-col gap-4">
          {q.data!.map((t) => (
            <TicketCard key={t.id} t={t} />
          ))}
        </div>
      )}
    </>
  )
}
