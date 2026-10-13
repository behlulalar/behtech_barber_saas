import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../../lib/cn'

export const controlStyles =
  'w-full min-h-11 rounded-sm border bg-surface px-3.5 py-2.5 text-base text-cream placeholder:text-muted/70 transition-colors ' +
  'hover:border-line-strong focus:border-copper focus:outline-none focus:ring-1 focus:ring-copper ' +
  'disabled:cursor-not-allowed disabled:opacity-50 read-only:text-muted-strong'

interface InputProps extends ComponentProps<'input'> {
  invalid?: boolean
  /** Girdinin solunda gösterilecek öğe (ikon ya da "+90" gibi). */
  leading?: ReactNode
}

export function Input({ invalid, leading, className, ...rest }: InputProps) {
  const field = (
    <input
      className={cn(controlStyles, invalid ? 'border-danger' : 'border-line', leading ? 'pl-10' : '', className)}
      {...rest}
    />
  )
  if (!leading) return field
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted">{leading}</span>
      {field}
    </div>
  )
}
