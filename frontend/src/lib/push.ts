import { useEffect } from 'react'

// Web Push (platform PWA) yardımcıları. Service worker yalnızca platform alanından kaydedilir.

export type PushSupport =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'ios-needs-install' }

interface NavigatorStandalone extends Navigator {
  standalone?: boolean
}

export function isIOS(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandalone(): boolean {
  return (navigator as NavigatorStandalone).standalone === true || window.matchMedia('(display-mode: standalone)').matches
}

export function pushSupport(): PushSupport {
  if (isIOS() && !isStandalone()) return { ok: false, reason: 'ios-needs-install' }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { ok: false, reason: 'unsupported' }
  }
  return { ok: true }
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register('/sw.js', { scope: '/' })
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null
  const reg = await navigator.serviceWorker.getRegistration('/')
  return reg ? reg.pushManager.getSubscription() : null
}

function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function toKey(buf: ArrayBuffer | null): string {
  if (!buf) return ''
  let s = ''
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** İzin ister, abone olur; sunucuya gönderilecek gövdeyi döndürür. İzin reddedilirse hata fırlatır. */
export async function subscribeToPush(publicKey: string) {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('permission-' + permission)
  const reg = await registerServiceWorker()
  await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }))
  return {
    endpoint: sub.endpoint,
    keys: { p256dh: toKey(sub.getKey('p256dh')), auth: toKey(sub.getKey('auth')) },
  }
}

/** Tarayıcı aboneliğini kaldırır ve endpoint'i döndürür (yoksa null). */
export async function unsubscribeFromPush(): Promise<string | null> {
  const sub = await getExistingSubscription()
  if (!sub) return null
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  return endpoint
}

/** Platform rotalarında PWA manifest'ini ekler, ayrılınca kaldırır (dükkân siteleri "BehTech Platform" olarak kurulmasın). */
export function usePlatformManifest() {
  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'manifest'
    link.href = '/manifest-platform.webmanifest'
    document.head.appendChild(link)
    return () => link.remove()
  }, [])
}
