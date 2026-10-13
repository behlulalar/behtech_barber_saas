import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn'
import { controlStyles } from './Input'

export function Textarea({ invalid, className, rows = 4, ...rest }: ComponentProps<'textarea'> & { invalid?: boolean }) {
  return (
    <textarea
      rows={rows}
      className={cn(controlStyles, 'resize-y', invalid ? 'border-danger' : 'border-line', className)}
      {...rest}
    />
  )
}
