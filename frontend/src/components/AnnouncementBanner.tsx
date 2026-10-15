import { useQuery } from '@tanstack/react-query'
import { Info, TriangleAlert, X } from 'lucide-react'
import { useState } from 'react'
import { adminApi } from '../lib/api'
import { cn } from '../lib/cn'
import type { AnnouncementLevel } from '../types/api'

const KEY = (id: number) => `announcement:dismissed:${id}`

function readDismissed(id: number): boolean {
  try {
    return localStorage.getItem(KEY(id)) === '1'
  } catch {
    return false
  }
}

const LEVEL_STYLES: Record<AnnouncementLevel, { box: string; icon: string }> = {
  info: { box: 'border-line-strong bg-panel text-cream', icon: 'text-copper-bright' },
  warning: { box: 'border-warning/40 bg-warning/10 text-cream', icon: 'text-warning' },
}

/** Tek duyuru şeridi; önizlemede de kullanılır. */
export function AnnouncementStrip({ title, body, level, onDismiss }: { title: string; body: string; level: AnnouncementLevel; onDismiss?: () => void }) {
  const st = LEVEL_STYLES[level]
  const Icon = level === 'warning' ? TriangleAlert : Info
  return (
    <div role={level === 'warning' ? 'alert' : 'status'} className={cn('flex items-start gap-3 rounded-md border py-2 pl-4', onDismiss ? 'pr-1' : 'pr-4', st.box)}>
      <Icon className={cn('mt-2.5 size-4 shrink-0', st.icon)} aria-hidden="true" />
      <div className="min-w-0 flex-1 py-1.5">
        <p className="break-words text-sm font-semibold">{title}</p>
        <p className="mt-0.5 whitespace-pre-line break-words text-sm text-muted-strong">{body}</p>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Duyuruyu kapat"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-muted-strong hover:text-cream active:bg-cream/10"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

/** İşletme panelinde platformdan gelen duyurular (en yeni 3). Kapatılanlar localStorage'da hatırlanır. */
export function AnnouncementBanner() {
  const q = useQuery({ queryKey: ['admin', 'announcements'], queryFn: adminApi.listAnnouncements, staleTime: 5 * 60_000, retry: false })
  const [hidden, setHidden] = useState<number[]>([])

  const items = [...(q.data ?? [])]
    .sort((a, b) => b.id - a.id)
    .filter((a) => !hidden.includes(a.id) && !readDismissed(a.id))
    .slice(0, 3)
  if (!items.length) return null

  function dismiss(id: number) {
    try {
      localStorage.setItem(KEY(id), '1')
    } catch {
      /* depolama kapalı: yalnızca bu oturumda gizle */
    }
    setHidden((h) => [...h, id])
  }

  return (
    <section aria-label="Duyurular" className="mb-6 flex flex-col gap-2">
      {items.map((a) => (
        <AnnouncementStrip key={a.id} title={a.title} body={a.body} level={a.level} onDismiss={() => dismiss(a.id)} />
      ))}
    </section>
  )
}

