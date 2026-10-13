import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

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

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const fallbackTenant = env.VITE_DEV_TENANT || process.env.VITE_DEV_TENANT || 'demo'
  return {
    plugins: [react(), tailwindcss()],
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
