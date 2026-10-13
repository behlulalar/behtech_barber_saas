import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface CardProps extends ComponentProps<'div'> {
  padding?: 'none' | 'sm' | 'md' | 'lg'
  /** Hover'da bakır çerçeve (tıklanabilir kartlar için). */
  interactive?: boolean
  /** 'panel' admin tarafı yüzeyi, 'surface' müşteri tarafı. */
  tone?: 'surface' | 'panel'
}

const PAD = { none: '', sm: 'p-4', md: 'p-5 md:p-6', lg: 'p-6 md:p-8' }

export function Card({ padding = 'md', interactive, tone = 'panel', className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-md border',
        tone === 'panel' ? 'border-panel-line bg-panel' : 'border-line bg-surface',
        interactive && 'transition-colors hover:border-copper/70',
        PAD[padding],
        className,
      )}
      {...rest}
    />
  )
}

interface CardHeaderProps {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function CardHeader({ title, description, action, className }: CardHeaderProps) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="font-display text-lg font-medium leading-snug text-cream">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}
