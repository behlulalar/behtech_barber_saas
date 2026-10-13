import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Skeleton } from './Skeleton'

interface StatCardProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  tone?: 'default' | 'copper' | 'success' | 'warning' | 'danger'
  loading?: boolean
  className?: string
}

const VALUE_TONES = {
  default: 'text-cream',
  copper: 'text-copper-bright',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
}

/** Sayı odaklı özet kutusu. Değerler Fraunces ile sayılara editoryal ağırlık verir. */
export function StatCard({ label, value, hint, icon, tone = 'default', loading, className }: StatCardProps) {
  return (
    <div className={cn('min-w-0 rounded-md border border-panel-line bg-panel p-4 md:p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">{label}</p>
        {icon && <span className="text-muted [&>svg]:size-4">{icon}</span>}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-9 w-24" />
      ) : (
        <p className={cn('mt-2 truncate font-display text-3xl font-medium tabular-nums md:text-4xl', VALUE_TONES[tone])}>{value}</p>
      )}
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  )
}
