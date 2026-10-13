import { useEffect, useRef, type RefObject } from 'react'

let lockCount = 0
let savedOverflow = ''
let savedPaddingRight = ''

/** Arka plan kaydırmasını kilitler; scrollbar kaybından doğan kaymayı padding ile telafi eder. */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    const body = document.body
    if (lockCount === 0) {
      const scrollbar = window.innerWidth - document.documentElement.clientWidth
      savedOverflow = body.style.overflow
      savedPaddingRight = body.style.paddingRight
      body.style.overflow = 'hidden'
      if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`
    }
    lockCount++
    return () => {
      lockCount--
      if (lockCount === 0) {
        body.style.overflow = savedOverflow
        body.style.paddingRight = savedPaddingRight
      }
    }
  }, [active])
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

const stack: symbol[] = []

/**
 * Diyalog davranışı: odak tuzağı, Esc ile kapatma, açılışta ilk alana odak,
 * kapanışta önceki öğeye odağı iade etme. İç içe diyaloglarda yalnız en üsttekini yönetir.
 */
export function useDialog(open: boolean, panelRef: RefObject<HTMLElement | null>, onClose: () => void, dismissible = true) {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useScrollLock(open)

  useEffect(() => {
    if (!open) return
    const id = Symbol('dialog')
    stack.push(id)
    const previous = document.activeElement as HTMLElement | null
    const panel = panelRef.current

    // İlk odak: autofocus > ilk alan > panelin kendisi
    const t = window.setTimeout(() => {
      if (!panel) return
      const auto = panel.querySelector<HTMLElement>('[data-autofocus]')
      const first = auto ?? panel.querySelector<HTMLElement>('input,select,textarea') ?? panel.querySelector<HTMLElement>(FOCUSABLE)
      ;(first ?? panel).focus({ preventScroll: true })
    }, 30)

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (items.length === 0) {
        e.preventDefault()
        panel.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      } else if (!panel.contains(active)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      const idx = stack.indexOf(id)
      if (idx >= 0) stack.splice(idx, 1)
      previous?.focus?.({ preventScroll: true })
    }
  }, [open, panelRef, dismissible])
}
