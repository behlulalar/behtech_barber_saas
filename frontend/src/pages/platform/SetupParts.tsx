import { Check, X } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import type { TenantSetup } from '../../types/api'

/** Liste için kurulum özeti: "Hazır" ya da "N eksik" (eksik maddeler tooltip/aria'da). */
export function SetupChip({ setup }: { setup: TenantSetup | null }) {
  if (!setup) return <span className="text-muted">—</span>
  const missing = setup.checks.filter((c) => !c.ok).map((c) => c.label)
  const title = missing.length ? `Eksik: ${missing.join(', ')}` : 'Kurulum tamam'
  if (setup.ready && missing.length === 0)
    return (
      <span title={title} aria-label={title}>
        <Badge tone="success">Hazır</Badge>
      </span>
    )
  return (
    <span title={title} aria-label={title}>
      <Badge tone={setup.ready ? 'neutral' : 'warning'}>{setup.ready ? `Hazır · ${setup.missing_count} bilgi` : `${setup.missing_count} eksik`}</Badge>
    </span>
  )
}

export function SetupList({ setup }: { setup: TenantSetup }) {
  return (
    <ul className="divide-y divide-panel-line">
      {setup.checks.map((c) => (
        <li key={c.key} className="flex min-h-11 items-start gap-3 py-2.5">
          <span
            className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full ${c.ok ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}
            aria-hidden="true"
          >
            {c.ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
          </span>
          <div className="min-w-0">
            <p className="break-words text-sm text-cream">
              {c.label}
              <span className="sr-only">{c.ok ? ' (tamam)' : ' (eksik)'}</span>
            </p>
            {!c.ok && <p className="break-words text-xs text-muted">{c.hint}</p>}
          </div>
        </li>
      ))}
    </ul>
  )
}

