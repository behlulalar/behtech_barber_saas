import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// Backend, Host header'ındaki subdomain'den tenant çözümlediği için yerel
// geliştirmede /api isteklerinin Host'unu `<VITE_DEV_TENANT>.behtechlabs.com`
// olarak eziyoruz (varsayılan: demo).
const BACKEND_URL = 'http://127.0.0.1:8001'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const tenant = env.VITE_DEV_TENANT || process.env.VITE_DEV_TENANT || 'demo'
  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': {
          target: BACKEND_URL,
          changeOrigin: false,
          headers: { Host: `${tenant}.behtechlabs.com` },
        },
      },
    },
  }
})
