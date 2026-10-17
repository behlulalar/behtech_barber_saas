import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// Backend, Host header'ındaki subdomain'den tenant çözümlediği için yerel geliştirmede
// /api isteklerinin Host'unu `<tenant>.behtechlabs.com` olarak eziyoruz. Tenant, production'daki
// gibi tarayıcı adresinden okunur: `deneme.localhost:5173` → `deneme`. Düz `localhost:5173`
// için VITE_DEV_TENANT (varsayılan: demo) kullanılır.
const BACKEND_URL = 'http://127.0.0.1:8001'
const SLUG_RE = /^[a-z0-9-]{1,63}$/

function tenantFromHost(host: string | undefined, fallback: string): string {
  const hostname = (host ?? '').split(':')[0].toLowerCase()
  if (!hostname.endsWith('.localhost')) return fallback
  const slug = hostname.slice(0, -'.localhost'.length)
  return SLUG_RE.test(slug) ? slug : fallback
}

// Arama motoru / paylaşım önizlemesi için alan adı bağımlı dosyalar: index.html'deki %PRODUCT_ORIGIN% yer tutucusu ve sitemap.xml
// derleme zamanındaki VITE_PRODUCT_HOST'tan üretilir (alan adı değişince yeniden derlemek yeter).
function seoPlugin(origin: string): Plugin {
  const pages = ['/', '/kayit']
  return {
    name: 'behtech-seo',
    transformIndexHtml: (html) => html.replaceAll('%PRODUCT_ORIGIN%', origin),
    generateBundle() {
      const urls = pages.map((p) => `  <url><loc>${origin}${p === '/' ? '/' : p}</loc></url>`).join('\n')
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n` })
      this.emitFile({
        type: 'asset', fileName: 'robots.txt',
        source: `User-agent: *\nDisallow: /panel\nDisallow: /platform\nDisallow: /api\nDisallow: /randevularim\n\nSitemap: ${origin}/sitemap.xml\n`,
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const fallbackTenant = env.VITE_DEV_TENANT || process.env.VITE_DEV_TENANT || 'demo'
  const productHost = env.VITE_PRODUCT_HOST || process.env.VITE_PRODUCT_HOST || `randevu.${env.VITE_BASE_DOMAIN || process.env.VITE_BASE_DOMAIN || 'behtechlabs.com'}`
  return {
    plugins: [react(), tailwindcss(), seoPlugin(`https://${productHost}`)],
    server: {
      proxy: {
        '/api': {
          target: BACKEND_URL,
          changeOrigin: false,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              const tenant = tenantFromHost(req.headers.host, fallbackTenant)
              proxyReq.setHeader('host', `${tenant}.behtechlabs.com`)
            })
          },
        },
      },
    },
  }
})
