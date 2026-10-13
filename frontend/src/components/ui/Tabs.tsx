import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface TabItem<T extends string> {
  value: T
  label: ReactNode
  count?: number
}

interface TabsProps<T extends string> {
  items: TabItem<T>[]
  value: T
  onChange: (value: T) => void
  label?: string
  className?: string
}

/**
 * Sekme şeridi (kontrollü). İçeriği sayfa kendisi value'ya göre render eder.
 * Taşarsa kendi içinde yatay kayar. Ok tuşları + Home/End desteklenir.
 */
export function Tabs<T extends string>({ items, value, onChange, label = 'Sekmeler', className }: TabsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  function onKeyDown(e: KeyboardEvent, index: number) {
    let next = index
    if (e.key === 'ArrowRight') next = (index + 1) % items.length
    else if (e.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = items.length - 1
    else return
    e.preventDefault()
    onChange(items[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div className={cn('no-scrollbar -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0', className)}>
      <div role="tablist" aria-label={label} className="flex min-w-max border-b border-panel-line">
        {items.map((item, i) => {
          const active = item.value === value
          return (
            <button
              key={item.value}
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(item.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                '-mb-px inline-flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 px-4 text-sm font-medium transition-colors',
                active ? 'border-copper text-cream' : 'border-transparent text-muted hover:text-cream',
              )}
            >
              {item.label}
              {item.count !== undefined && (
                <span className={cn('rounded-xs px-1.5 py-0.5 text-xs tabular-nums', active ? 'bg-copper/15 text-copper-bright' : 'bg-cream/5 text-muted')}>
                  {item.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface SegmentedProps<T extends string> {
  items: { value: T; label: ReactNode }[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
}

/** Kısa seçenek grubu (ör. Gün / Hafta). Radiogroup semantiği. */
export function SegmentedControl<T extends string>({ items, value, onChange, label, className }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-sm border border-line-strong p-0.5', className)}>
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(item.value)}
            className={cn(
              'min-h-11 rounded-xs px-4 text-sm font-medium transition-colors',
              active ? 'bg-copper text-ink' : 'text-muted-strong hover:text-cream',
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
