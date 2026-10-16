import { X } from 'lucide-react'
import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'
import { IconButton } from './Button'
import { useDialog } from './useDialog'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children: ReactNode
  /** Sabit alt çubuk (butonlar). Mobilde safe-area'ya saygı duyar. */
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  /** false ise Esc / dış tıklama kapatmaz (kayıt sürerken vb.). */
  dismissible?: boolean
}

const WIDTHS = { sm: 'md:max-w-md', md: 'md:max-w-xl', lg: 'md:max-w-3xl' }

/**
 * Mobilde alttan açılan sheet, masaüstünde ortalanmış diyalog.
 * Odak tuzağı, Esc, scroll kilidi dahil. İçerik kendi içinde kayar (max 90dvh).
 */
export function Modal({ open, onClose, title, description, children, footer, size = 'md', dismissible = true }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const uid = useId()
  const titleId = `m${uid.replace(/:/g, '')}-t`
  const descId = `m${uid.replace(/:/g, '')}-d`
  useDialog(open, panelRef, onClose, dismissible)

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      <div
        className="absolute inset-0 animate-fade-in bg-scrim"
        onClick={dismissible ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[90dvh] w-full min-w-0 flex-col overscroll-contain border border-line-strong bg-surface-raised shadow-pop outline-none',
          'animate-sheet-up rounded-t-lg md:max-h-[85dvh] md:animate-pop-in md:rounded-md',
          WIDTHS[size],
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong md:hidden" aria-hidden="true" />
        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-4 md:px-6 md:pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-xl font-medium leading-snug text-cream">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-muted">
                {description}
              </p>
            )}
          </div>
          {dismissible && (
            <IconButton label="Kapat" onClick={onClose} className="-mr-2 -mt-1">
              <X className="size-5" />
            </IconButton>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-2 md:px-6">{children}</div>
        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t border-line px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 md:flex-row md:justify-end md:px-6 md:pb-5">
            {footer}
          </div>
        ) : (
          <div className="pb-safe h-4 shrink-0" />
        )}
      </div>
    </div>,
    document.body,
  )
}
