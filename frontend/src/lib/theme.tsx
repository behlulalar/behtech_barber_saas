// Açık/koyu tema. Varsayılan AÇIK. Tercih tarayıcıda (localStorage 'theme') tutulur; backend'e gitmez.
// İlk boyama index.html'deki erken script ile yapılır, bu modül yalnızca değişimi yönetir.
import { Moon, Sun } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { cn } from './cn'

export type Theme = 'light' | 'dark'

const KEY = 'theme'
const META = { light: '#F6F1E9', dark: '#15110E' }
const listeners = new Set<() => void>()

function current(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

export function setTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META[t])
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* depolama kapalı: yalnızca bu oturumda geçerli */
  }
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  // Başka sekmede değişirse bu sekme de uysun.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      document.documentElement.setAttribute('data-theme', e.newValue === 'dark' ? 'dark' : 'light')
      cb()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', onStorage)
  }
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, current, () => 'light' as Theme)
  return { theme, setTheme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') }
}

/** Açık/koyu tema düğmesi (44px dokunma hedefi). `withLabel` menü/çekmece içinde yazılı gösterim içindir. */
export function ThemeToggle({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  const { theme, toggle } = useTheme()
  const next = theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'
  const Icon = theme === 'dark' ? Sun : Moon
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={withLabel ? undefined : next}
      title={next}
      className={cn(
        'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-sm text-muted-strong transition-colors hover:text-cream',
        withLabel && 'justify-start px-3 text-sm font-medium',
        className,
      )}
    >
      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
      {withLabel && <span>{theme === 'dark' ? 'Açık tema' : 'Koyu tema'}</span>}
    </button>
  )
}
