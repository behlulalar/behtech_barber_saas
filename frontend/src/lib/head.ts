// Sekme başlığı ve sekme ikonu. Başlık en özelden en genele: "Randevular · Panel · Demo Berber".
import { useEffect } from 'react'
import { matchPath, useLocation } from 'react-router-dom'

export const PRODUCT_NAME = 'BehTech Randevu'
const DEFAULT_ICON = '/favicon.svg'

export function useDocumentTitle(...parts: (string | null | undefined | false)[]) {
  const title = parts.filter(Boolean).join(' · ')
  useEffect(() => {
    if (title) document.title = title
  }, [title])
}

/** Verilen rota listesinden şu anki sayfanın etiketini bulur (ör. panel menüsü). */
export function useRouteLabel(routes: { to: string; label: string; end?: boolean }[]): string | undefined {
  const { pathname } = useLocation()
  return routes.find((r) => matchPath({ path: r.to, end: r.end ?? true }, pathname))?.label
}

/**
 * Sekme ikonunu dükkânın logosu yapar (data URL); logo yoksa ya da bileşen kalkınca ürün logosuna döner.
 */
export function useFavicon(href: string | null | undefined) {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) return
    link.href = href || DEFAULT_ICON
    link.type = href?.match(/^data:([^;,]+)/)?.[1] ?? 'image/svg+xml'
    return () => {
      link.href = DEFAULT_ICON
      link.type = 'image/svg+xml'
    }
  }, [href])
}
