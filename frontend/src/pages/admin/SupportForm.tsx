// İşletme paneli: "Bize yazın" penceresi + gönderilen taleplerin durumu. Yanıt Bildirimler'e düşer. Yalnızca yönetici/sahip.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LifeBuoy } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Field } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import { useToast } from '../../components/ui/Toast'
import { adminApi, errorMessage } from '../../lib/api'
import type { SupportCategory } from '../../types/api'
import { formatDateTimeDMY } from '../platform/platformShared'

const LABELS: Record<SupportCategory, string> = { whatsapp: 'WhatsApp bağlantısı', appointments: 'Randevular', payment: 'Ödeme / abonelik', other: 'Diğer' }

export function SupportButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} leftIcon={<LifeBuoy className="size-4" />}>
        Bize yazın
      </Button>
      {open && <SupportModal onClose={() => setOpen(false)} />}
    </>
  )
}

function SupportModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [category, setCategory] = useState<SupportCategory>('whatsapp')
  const [message, setMessage] = useState('')
  const send = useMutation({
    mutationFn: () => adminApi.createSupportTicket({ category, message: message.trim() }),
    onSuccess: () => {
      toast.success('Talebiniz iletildi. Yanıt Bildirimler sayfanıza düşecek')
      void qc.invalidateQueries({ queryKey: ['admin', 'support'] })
      onClose()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!send.isPending}
      size="sm"
      title="Bize yazın"
      description="Sorununuzu ya da isteğinizi yazın; yanıtı Bildirimler sayfanızda göreceksiniz."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={send.isPending}>
            Vazgeç
          </Button>
          <Button onClick={() => send.mutate()} loading={send.isPending} disabled={message.trim().length < 5}>
            Gönder
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <Field label="Konu">
          <Select value={category} onChange={(e) => setCategory(e.target.value as SupportCategory)}>
            {(Object.keys(LABELS) as SupportCategory[]).map((k) => (
              <option key={k} value={k}>{LABELS[k]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Mesajınız">
          <Textarea rows={5} value={message} maxLength={2000} onChange={(e) => setMessage(e.target.value)} data-autofocus />
        </Field>
      </div>
    </Modal>
  )
}

/** Gönderilen son talepler (varsa) — durum ve yanıt. */
export function MyTickets() {
  const q = useQuery({ queryKey: ['admin', 'support'], queryFn: adminApi.listSupportTickets, retry: false, staleTime: 30_000 })
  const items = q.data ?? []
  if (!items.length) return null
  return (
    <section aria-label="Taleplerim" className="mt-8">
      <h2 className="mb-3 font-display text-xl text-cream">Taleplerim</h2>
      <ul className="flex flex-col gap-3">
        {items.slice(0, 5).map((t) => (
          <li key={t.id} className="rounded-md border border-line bg-surface p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{LABELS[t.category]}</Badge>
              <Badge tone={t.status === 'open' ? 'warning' : 'success'}>{t.status === 'open' ? 'Yanıt bekliyor' : 'Yanıtlandı'}</Badge>
              <span className="text-xs tabular-nums text-muted">{formatDateTimeDMY(t.created_at)}</span>
            </div>
            <p className="mt-2 whitespace-pre-line break-words text-cream">{t.message}</p>
            {t.reply && <p className="mt-2 whitespace-pre-line break-words rounded-sm bg-panel-raised p-2.5 text-muted-strong">{t.reply}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}
