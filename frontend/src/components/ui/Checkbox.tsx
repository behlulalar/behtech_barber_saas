import { Check } from 'lucide-react'
import { useId, type ComponentProps, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface CheckboxProps extends Omit<ComponentProps<'input'>, 'type' | 'className'> {
  label: ReactNode
  description?: ReactNode
  className?: string
}

export function Checkbox({ label, description, className, id, ...rest }: CheckboxProps) {
  const uid = useId()
  const inputId = id ?? `cb${uid.replace(/:/g, '')}`
  return (
    <label htmlFor={inputId} className={cn('flex min-h-11 cursor-pointer items-start gap-3 py-2', className)}>
      <span className="relative mt-0.5 flex size-5 shrink-0">
        <input id={inputId} type="checkbox" className="peer absolute inset-0 size-5 cursor-pointer opacity-0" {...rest} />
        <span className="flex size-5 items-center justify-center rounded-xs border border-line-strong bg-surface text-ink transition-colors peer-checked:border-copper peer-checked:bg-copper peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-copper-bright peer-disabled:opacity-50 [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100">
          <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
        </span>
      </span>
      <span className="min-w-0 text-sm text-cream">
        {label}
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
    </label>
  )
}
