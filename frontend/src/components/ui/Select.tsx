import { ChevronDown } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn'
import { controlStyles } from './Input'

/** Yerel <select> (mobilde sistem seçicisi açılır). <option> çocukları verin. */
export function Select({ invalid, className, children, ...rest }: ComponentProps<'select'> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <select
        className={cn(controlStyles, 'cursor-pointer appearance-none pr-10', invalid ? 'border-danger' : 'border-line', className)}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
    </div>
  )
}
