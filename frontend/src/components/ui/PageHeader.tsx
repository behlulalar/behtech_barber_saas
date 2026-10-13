import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface PageHeaderProps {
  title: string
  description?: ReactNode
  /** Başlığın üstündeki küçük bakır etiket. */
  eyebrow?: string
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h1 className="font-display text-3xl font-medium leading-tight tracking-tight text-cream md:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted md:text-base">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
