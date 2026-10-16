import { useEffect, useSyncExternalStore } from 'react'
import { isIOS, isStandalone, registerServiceWorker } from './push'

/* ------------------------------------------------------------------ */
/* İşletme paneli manifest'i (uygulama gibi kurulabilsin)               */
/* ------------------------------------------------------------------ */

/** Panel açıkken dükkâna özel manifest ekler (sunucudan, dükkân adıyla), ayrılınca kaldırır. blob: manifest kurulabilirlik
 * ölçütünü her tarayıcıda sağlamadığı için gerçek bir adres kullanılır. */
export function useTenantPanelManifest(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const link = document.createElement('link')
    link.rel = 'manifest'
    link.href = '/api/public/panel-manifest'
    document.head.appendChild(link)
    return () => link.remove()
  }, [enabled])
}

/** Panel açılınca service worker'ı kaydeder (Chrome'un "yüklenebilir" ölçütü için). Hata sessizce yutulur. */
export function useRegisterServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    registerServiceWorker().catch(() => {})
  }, [])
}

/* ------------------------------------------------------------------ */
/* "Uygulamayı yükle"                                                  */
/* ------------------------------------------------------------------ */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Olay sayfa yüklenirken (panel bileşeni bağlanmadan) gelebilir; bu yüzden modül düzeyinde yakalanır.
let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
function notify() {
  listeners.forEach((l) => l())
}
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}
function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
const getDeferred = () => deferred

export type InstallMode = 'native' | 'ios' | null

/** Kurulum durumu: 'native' (tarayıcı istemi var), 'ios' (Safari'de elle ekleme yönergesi), null (gizle). */
export function useInstallPrompt(): { mode: InstallMode; promptInstall: () => Promise<void> } {
  const event = useSyncExternalStore(subscribe, getDeferred, () => null)
  const installed = isStandalone()
  const mode: InstallMode = installed ? null : event ? 'native' : isIOS() ? 'ios' : null
  async function promptInstall() {
    const ev = deferred
    if (!ev) return
    await ev.prompt()
    await ev.userChoice.catch(() => null)
    deferred = null // olay tek kullanımlık
    notify()
  }
  return { mode, promptInstall }
}
