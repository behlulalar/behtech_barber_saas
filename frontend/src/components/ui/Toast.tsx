import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'

type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info }
const COLORS = { success: 'text-success', error: 'text-danger', info: 'text-info' }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setItems((cur) => cur.filter((t) => t.id !== id)), [])

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++
      setItems((cur) => [...cur.slice(-3), { id, kind, message }])
      window.setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 4000)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] md:items-end md:px-6 md:pb-6"
        >
          {items.map((t) => {
            const Icon = ICONS[t.kind]
            return (
              <div
                key={t.id}
                role={t.kind === 'error' ? 'alert' : 'status'}
                className="pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-md border border-line-strong bg-surface-raised px-4 py-3 shadow-pop"
              >
                <Icon className={cn('mt-0.5 size-5 shrink-0', COLORS[t.kind])} aria-hidden="true" />
                <p className="min-w-0 flex-1 break-words text-sm text-cream">{t.message}</p>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Bildirimi kapat"
                  className="-mr-1 -mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-muted hover:text-cream"
                >
                  <X className="size-4" />
                </button>
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

/** const toast = useToast(); toast.success('Kaydedildi'); toast.error(errorMessage(err)) */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast, ToastProvider içinde kullanılmalı')
  return ctx
}
