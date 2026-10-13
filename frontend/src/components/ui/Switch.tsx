import { useId, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: ReactNode
  description?: ReactNode
  disabled?: boolean
  className?: string
}

/** Aç/kapa anahtarı (role="switch"). label verilirse yanında metin gösterilir. */
export function Switch({ checked, onChange, label, description, disabled, className }: SwitchProps) {
  const uid = useId()
  const labelId = `sw${uid.replace(/:/g, '')}`
  return (
    <div className={cn('flex min-h-11 items-center justify-between gap-4', className)}>
      {label && (
        <span id={labelId} className="min-w-0 text-sm text-cream">
          {label}
          {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : 'Aç/kapat'}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-[""] items-center rounded-full border transition-colors disabled:opacity-45',
          checked ? 'border-copper bg-copper' : 'border-line-strong bg-surface',
        )}
      >
        <span
          className={cn(
            'inline-block size-4 rounded-full transition-transform duration-200',
            checked ? 'translate-x-6 bg-ink' : 'translate-x-1 bg-muted-strong',
          )}
        />
      </button>
    </div>
  )
}
