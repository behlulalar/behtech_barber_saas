import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface FieldProps {
  label: string
  hint?: ReactNode
  error?: string | null
  required?: boolean
  className?: string
  /** Tek bir Input/Select/Textarea ya da (id, aria) alan bir render fonksiyonu. */
  children: ReactElement | ((a11y: FieldA11y) => ReactNode)
}

export interface FieldA11y {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  invalid?: boolean
}

/** Etiket + ipucu + hata sarmalayıcı. id/aria bağlantılarını otomatik kurar. */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const uid = useId()
  const id = `f${uid.replace(/:/g, '')}`
  const hintId = `${id}-hint`
  const errId = `${id}-err`
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined
  const a11y: FieldA11y = {
    id,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
    invalid: error ? true : undefined,
  }

  let control: ReactNode
  if (typeof children === 'function') control = children(a11y)
  else if (isValidElement(children)) control = cloneElement(children as ReactElement<Record<string, unknown>>, { ...a11y })
  else control = children

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium tracking-wide text-muted-strong">
        {label}
        {required && (
          <span className="ml-0.5 text-copper" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
