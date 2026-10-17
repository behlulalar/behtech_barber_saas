import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import type { AppointmentStatus } from '../../types/api'

export type BadgeTone = 'neutral' | 'copper' | 'success' | 'warning' | 'danger' | 'info'

const TONES: Record<BadgeTone, string> = {
  neutral: 'border-line-strong bg-cream/5 text-muted-strong',
  copper: 'border-copper/40 bg-copper/10 text-copper-bright',
  success: 'border-success/40 bg-success/10 text-success',
  warning: 'border-warning/40 bg-warning/10 text-warning',
  danger: 'border-danger/40 bg-danger/10 text-danger',
  info: 'border-info/40 bg-info/10 text-info',
}

export function Badge({ tone = 'neutral', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-xs border px-2 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  confirmed: 'Onaylandı',
  completed: 'Tamamlandı',
  cancelled: 'İptal',
  no_show: 'Gelmedi',
}

export const STATUS_TONES: Record<AppointmentStatus, BadgeTone> = {
  confirmed: 'info',
  completed: 'success',
  cancelled: 'neutral',
  no_show: 'danger',
}

export const STATUS_ORDER: AppointmentStatus[] = ['confirmed', 'completed', 'cancelled', 'no_show']

/** Randevu durumu rozeti (Türkçe etiket + renk). `hideConfirmed`: işletme panelinde "Onaylandı" gösterilmez
 * (randevular zaten onaylı gelir; yalnızca sapmalar — tamamlandı, iptal, gelmedi — etiketlenir, ekran sade kalır). */
export function StatusBadge({ status, className, hideConfirmed }: { status: AppointmentStatus; className?: string; hideConfirmed?: boolean }) {
  if (hideConfirmed && status === 'confirmed') return null
  return (
    <Badge tone={STATUS_TONES[status]} className={className}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </Badge>
  )
}
