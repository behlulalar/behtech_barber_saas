import { BASE_DOMAIN } from '../../lib/site'

// Tanıtım sayfasındaki iletişim bilgileri. Boş bırakılan kanal sayfada gösterilmez.
// TODO(kullanıcı): gerçek iletişim bilgileriyle doldurun.
export const CONTACT = {
  /** Ülke koduyla, boşluksuz: '905551234567'. wa.me bağlantısında kullanılır. */
  whatsapp: '',
  email: '',
}

/** "Canlı demoyu gör" butonunun gittiği örnek dükkân. */
export const DEMO_SITE_URL = import.meta.env.DEV ? 'http://localhost:5173/' : `https://demo.${BASE_DOMAIN}/`

export const PRODUCT_NAME = 'BehTech Randevu'
