import { BASE_DOMAIN } from '../../lib/site'

// Tanıtım sayfasındaki iletişim bilgileri. Boş bırakılan kanal sayfada gösterilmez.
export const CONTACT = {
  /** Ülke koduyla, boşluksuz: '905551234567'. wa.me bağlantısında kullanılır. Boşsa WhatsApp düğmesi çıkmaz. */
  whatsapp: '',
  email: 'info@behtechlabs.com',
  /** Tam Instagram adresi. */
  instagram: 'https://www.instagram.com/behtechlabs/',
}

/** "https://www.instagram.com/behtechlabs/" -> "@behtechlabs" */
export function instagramHandle(url: string): string {
  const m = url.match(/instagram\.com\/([^/?#]+)/i)
  return m ? `@${m[1]}` : url
}

/** "Canlı demoyu gör" butonunun gittiği örnek dükkân. */
export const DEMO_SITE_URL = import.meta.env.DEV ? 'http://localhost:5173/' : `https://demo.${BASE_DOMAIN}/`

export const PRODUCT_NAME = 'BehTech Randevu'
