import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {icon && (
        <div className="mb-5 flex size-12 items-center justify-center rounded-full border border-line-strong text-copper [&>svg]:size-5">
          {icon}
        </div>
      )}
      <h3 className="font-display text-xl font-medium text-cream">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
