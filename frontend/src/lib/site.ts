// Hangi sitedeyiz? Dükkân siteleri `<slug>.<BASE_DOMAIN>`; ürünün tanıtım sitesi ise PRODUCT_HOST'ta yayınlanır.
// Alan adı derleme zamanında ayarlanır (VITE_BASE_DOMAIN, VITE_PRODUCT_HOST); alan adı değişince yeniden derlemek yeter.
// Yerelde tanıtım sitesi `randevu.localhost:5173`. "randevu" slug'ı backend'de rezerve olduğundan hiçbir dükkân bu adresi alamaz.

export const BASE_DOMAIN: string = (import.meta.env.VITE_BASE_DOMAIN as string | undefined) || 'behtechlabs.com'
export const PRODUCT_SUBDOMAIN = 'randevu'
/** Tanıtım sitesinin tam alan adı (varsayılan `randevu.<BASE_DOMAIN>`; üretimde ana alan adının kendisi de olabilir). */
export const PRODUCT_HOST: string = (import.meta.env.VITE_PRODUCT_HOST as string | undefined) || `${PRODUCT_SUBDOMAIN}.${BASE_DOMAIN}`

export function isProductHost(hostname: string = window.location.hostname): boolean {
  const host = hostname.toLowerCase()
  return host === PRODUCT_HOST.toLowerCase() || host === `${PRODUCT_SUBDOMAIN}.localhost`
}

/** Ürünün tanıtım sitesi adresi (demo dükkândan "geri dön" bağlantısı için). */
export function productSiteUrl(): string {
  if (import.meta.env.DEV) return `http://${PRODUCT_SUBDOMAIN}.localhost:${window.location.port || '80'}/`
  return `https://${PRODUCT_HOST}/`
}

/** Demo dükkânın slug'ı: bu sitede "tanıtım sayfasına dön" bandı gösterilir. */
export const DEMO_SLUG = 'demo'

/** Bir dükkânın canlı site adresi. */
export function tenantSiteUrl(slug: string): string {
  return `https://${slug}.${BASE_DOMAIN}`
}

/** Destek girişi için dükkânın panel adresi: yerelde `<slug>.localhost:<port>`, canlıda `<slug>.<BASE_DOMAIN>`. */
export function tenantOrigin(slug: string): string {
  if (import.meta.env.DEV) return `http://${slug}.localhost:${window.location.port || '80'}`
  return tenantSiteUrl(slug)
}
