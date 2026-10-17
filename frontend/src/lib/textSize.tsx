// Panel yazı boyutu: kök yazı boyutunu (rem) ölçekler, yani tüm panel birlikte büyür/küçülür.
// Tercih bu cihazda (localStorage 'text-size') tutulur; yalnızca panel düzenleri uygular, müşteri sitesi etkilenmez.
import { useLayoutEffect, useSyncExternalStore } from 'react'
import { cn } from './cn'

export type TextSize = 'sm' | 'md' | 'lg' | 'xl'

const KEY = 'text-size'
const SCALE: Record<TextSize, string> = { sm: '90%', md: '100%', lg: '115%', xl: '130%' }
const OPTIONS: { value: TextSize; label: string; aria: string; cls: string }[] = [
  { value: 'sm', label: 'A', aria: 'Küçük', cls: 'text-xs' },
  { value: 'md', label: 'A', aria: 'Normal', cls: 'text-sm' },
  { value: 'lg', label: 'A', aria: 'Büyük', cls: 'text-lg' },
  { value: 'xl', label: 'A', aria: 'Çok büyük', cls: 'text-2xl' },
]
const listeners = new Set<() => void>()

function read(): TextSize {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'sm' || v === 'lg' || v === 'xl') return v
  } catch {
    /* depolama kapalı */
  }
  return 'md'
}

let size: TextSize = read()

export function setTextSize(s: TextSize) {
  size = s
  try {
    localStorage.setItem(KEY, s)
  } catch {
    /* yalnızca bu oturumda geçerli */
  }
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => void listeners.delete(cb)
}

export function useTextSize() {
  return useSyncExternalStore(subscribe, () => size, () => 'md' as TextSize)
}

/** Panel düzenlerinde çağrılır: boyutu uygular, panelden çıkınca (müşteri sitesi) sıfırlar. */
export function useApplyTextSize() {
  const s = useTextSize()
  useLayoutEffect(() => {
    document.documentElement.style.fontSize = SCALE[s]
    return () => {
      document.documentElement.style.fontSize = ''
    }
  }, [s])
}

/** "Yazı boyutu" seçici: 4 kademe, her biri ≥44px dokunma hedefi (Hesabım > Görünüm). */
export function TextSizeControl({ className }: { className?: string }) {
  const s = useTextSize()
  return (
    <div className={className}>
      <div role="radiogroup" aria-label="Yazı boyutu" className="grid max-w-md grid-cols-4 gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={s === o.value}
            aria-label={o.aria}
            title={o.aria}
            onClick={() => setTextSize(o.value)}
            className={cn(
              'inline-flex min-h-12 items-center justify-center rounded-sm border font-semibold leading-none transition-colors',
              o.cls,
              s === o.value ? 'border-copper bg-panel-hover text-cream' : 'border-panel-line text-muted-strong hover:bg-panel-raised hover:text-cream',
            )}
          >
            {o.label}
            <span className="sr-only"> ({o.aria})</span>
          </button>
        ))}
      </div>
    </div>
  )
}
