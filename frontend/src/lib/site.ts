// Hangi sitedeyiz? Dükkân siteleri `<slug>.behtechlabs.com`; ürünün tanıtım sitesi ise
// PRODUCT_SUBDOMAIN altında yayınlanır (yerelde `randevu.localhost:5173`).
// "randevu" slug'ı backend'de rezerve edildiği için hiçbir dükkân bu adresi alamaz.

export const PRODUCT_SUBDOMAIN = 'randevu'
export const BASE_DOMAIN = 'behtechlabs.com'

export function isProductHost(hostname: string = window.location.hostname): boolean {
  const host = hostname.toLowerCase()
  return host === `${PRODUCT_SUBDOMAIN}.${BASE_DOMAIN}` || host === `${PRODUCT_SUBDOMAIN}.localhost`
}

/** Bir dükkânın canlı site adresi. */
export function tenantSiteUrl(slug: string): string {
  return `https://${slug}.${BASE_DOMAIN}`
}
