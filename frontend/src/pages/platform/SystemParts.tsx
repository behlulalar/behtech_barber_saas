import { CircleAlert, CircleCheck, CircleHelp, CircleSlash } from 'lucide-react'
import { cn } from '../../lib/cn'

export type MarkState = 'ok' | 'error' | 'off' | 'unknown'

const STATES = {
  ok: { Icon: CircleCheck, cls: 'text-success' },
  error: { Icon: CircleAlert, cls: 'text-danger' },
  off: { Icon: CircleSlash, cls: 'text-muted' },
  unknown: { Icon: CircleHelp, cls: 'text-muted' },
}

/** Durum: simge + metin (renk tek başına anlam taşımaz). */
export function StatusMark({ state, label }: { state: MarkState; label: string }) {
  const { Icon, cls } = STATES[state]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', cls)}>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {label}
    </span>
  )
}
