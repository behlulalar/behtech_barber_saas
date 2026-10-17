import { Info, TriangleAlert, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useInbox, useMarkRead } from '../lib/inbox'
import { cn } from '../lib/cn'
import type { AnnouncementLevel } from '../types/api'

const LEVEL_STYLES: Record<AnnouncementLevel, { box: string; icon: string }> = {
  info: { box: 'border-line-strong bg-panel text-cream', icon: 'text-copper-bright' },
  warning: { box: 'border-warning/40 bg-warning/10 text-cream', icon: 'text-warning' },
  critical: { box: 'border-danger/40 bg-danger/10 text-cream', icon: 'text-danger' },
}

/** Tek duyuru şeridi; önizlemede de kullanılır. */
export function AnnouncementStrip({ title, body, level, onDismiss }: { title: string; body: string; level: AnnouncementLevel; onDismiss?: () => void }) {
  const st = LEVEL_STYLES[level]
  const Icon = level === 'info' ? Info : TriangleAlert
  return (
    <div role={level === 'info' ? 'status' : 'alert'} className={cn('flex items-start gap-3 rounded-md border py-2 pl-4', onDismiss ? 'pr-1' : 'pr-4', st.box)}>
      <Icon className={cn('mt-2.5 size-4 shrink-0', st.icon)} aria-hidden="true" />
      <div className="min-w-0 flex-1 py-1.5">
        <p className="break-words text-sm font-semibold">{title}</p>
        <p className="mt-0.5 whitespace-pre-line break-words text-sm text-muted-strong">{body}</p>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Okundu olarak işaretle" title="Okundu olarak işaretle"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-muted-strong hover:text-cream active:bg-cream/10"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

/** Okunmamış bildirimler (duyuru + işletmeye özel mesaj). Okundu bilgisi sunucuda tutulur: sayfa yenilense,
 * başka cihazdan girilse de okunana kadar görünür. WhatsApp kopma uyarısı ayrı şeritte (WhatsappAlertBanner). */
export function AnnouncementBanner() {
  const q = useInbox()
  const markRead = useMarkRead()
  const items = (q.data?.items ?? []).filter((i) => !i.read && i.kind !== 'whatsapp')
  if (!items.length) return null
  const shown = items.slice(0, 3)

  return (
    <section aria-label="Bildirimler" className="mb-6 flex flex-col gap-2">
      {shown.map((i) => (
        <AnnouncementStrip key={i.key} title={i.title} body={i.body} level={i.level} onDismiss={() => markRead.mutate([i.key])} />
      ))}
      {items.length > shown.length && (
        <Link to="/panel/bildirimler" className="inline-flex min-h-11 items-center text-sm font-medium text-copper-bright hover:underline">
          {items.length - shown.length} bildirim daha — tümünü gör
        </Link>
      )}
    </section>
  )
}
