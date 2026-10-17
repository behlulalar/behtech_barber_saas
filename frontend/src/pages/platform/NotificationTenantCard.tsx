// Platform: tek bir işletmenin paneline özel bildirim gönder + gönderilenleri ve okundu durumunu gör.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { Skeleton } from '../../components/ui/Skeleton'
import { SegmentedControl } from '../../components/ui/Tabs'
import { Textarea } from '../../components/ui/Textarea'
import { useToast } from '../../components/ui/Toast'
import { errorMessage, platformApi } from '../../lib/api'
import type { AnnouncementLevel } from '../../types/api'
import { formatDateTimeDMY } from './platformShared'

const LEVEL_LABEL: Record<AnnouncementLevel, string> = { info: 'Bilgi', warning: 'Uyarı', critical: 'Acil' }

export function NotificationTenantCard({ tenantId }: { tenantId: number }) {
  const qc = useQueryClient()
  const toast = useToast()
  const key = ['platform', 'tenant', tenantId, 'notifications'] as const
  const q = useQuery({ queryKey: key, queryFn: () => platformApi.listTenantNotifications(tenantId), retry: false })
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [level, setLevel] = useState<AnnouncementLevel>('info')

  const send = useMutation({
    mutationFn: () => platformApi.sendTenantNotification(tenantId, { title: title.trim(), body: body.trim(), level }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key })
      setTitle('')
      setBody('')
      setLevel('info')
      toast.success('Bildirim gönderildi')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  const canSend = title.trim().length > 0 && body.trim().length > 0

  return (
    <Card className="lg:col-span-2">
      <CardHeader title="Bildirim gönder" description="Yalnızca bu işletmenin paneline düşer; okunana kadar panelin üstünde görünür. Toplu gönderim için Duyurular'ı kullanın." />
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (canSend) send.mutate()
        }}
      >
        <Field label="Başlık">
          <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Mesaj">
          <Textarea rows={3} value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium tracking-wide text-muted-strong">Seviye</span>
          <SegmentedControl
            label="Seviye"
            value={level}
            onChange={setLevel}
            items={[
              { value: 'info', label: 'Bilgi' },
              { value: 'warning', label: 'Uyarı' },
              { value: 'critical', label: 'Acil' },
            ]}
          />
        </div>
        <div>
          <Button type="submit" loading={send.isPending} disabled={!canSend}>
            Gönder
          </Button>
        </div>
      </form>

      <div className="mt-6 border-t border-panel-line pt-4">
        <p className="mb-2 text-sm font-medium text-cream">Son gönderilenler</p>
        {q.isError ? (
          <p role="alert" className="text-sm text-danger">{errorMessage(q.error)}</p>
        ) : !q.data ? (
          <Skeleton className="h-16 w-full" />
        ) : q.data.length === 0 ? (
          <p className="text-sm text-muted">Henüz bildirim yok.</p>
        ) : (
          <ul className="divide-y divide-panel-line">
            {q.data.slice(0, 8).map((n) => (
              <li key={n.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="break-words text-cream">{n.title}</p>
                  <p className="text-xs tabular-nums text-muted">
                    {LEVEL_LABEL[n.level as AnnouncementLevel] ?? n.level} · {formatDateTimeDMY(n.created_at)}
                    {n.kind === 'whatsapp' ? ' · sistem' : ''}
                  </p>
                </div>
                <Badge tone={n.read_at ? 'success' : 'warning'}>{n.read_at ? `Okundu · ${formatDateTimeDMY(n.read_at)}` : 'Okunmadı'}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
