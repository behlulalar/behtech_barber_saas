import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Backend subdomain tabanlı tenant çözümlemesi yaptığı için (Host header'ına
// bakıyor), yerel geliştirmede gerçek bir subdomain'imiz olmadığından
// backend'e giden isteklerin Host header'ını burada elle ayarlıyoruz.
// Gerçek migrate edilmiş tenant ile geliştiriyoruz: sefapertev.
const DEV_TENANT_HOST = 'sefapertev.behtechlabs.com'
const BACKEND_URL = 'http://127.0.0.1:8001'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: Object.fromEntries(
      ['/health', '/tenants', '/auth', '/staff', '/services', '/booked-times', '/appointments', '/webhooks', '/platform'].map(
        (path) => [
          path,
          {
            target: BACKEND_URL,
            changeOrigin: true,
            headers: { Host: DEV_TENANT_HOST },
          },
        ],
      ),
    ),
  },
})
