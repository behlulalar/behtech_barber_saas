import { X } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'
import { IconButton } from './Button'
import { useDialog } from './useDialog'

interface DrawerProps {
  open: boolean
  onClose: () => void
  /** Ekran okuyucu için başlık */
  label: string
  children: ReactNode
  className?: string
}

/** Sağdan kayan çekmece (mobil menü). 100vw KULLANMAZ; en fazla 85% genişlik. */
export function Drawer({ open, onClose, label, children, className }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  useDialog(open, panelRef, onClose)
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-fade-in bg-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 right-0 flex h-dvh w-[85%] max-w-sm animate-drawer-in flex-col overscroll-contain border-l border-line-strong bg-panel pt-safe pb-safe outline-none',
          className,
        )}
      >
        <div className="flex justify-end px-2 pt-2">
          <IconButton label="Menüyü kapat" onClick={onClose}>
            <X className="size-5" />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
