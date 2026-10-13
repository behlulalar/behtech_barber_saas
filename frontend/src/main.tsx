import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { ToastProvider } from './components/ui/Toast'
import { AUTH_EVENT, ApiError, tokenStore, type TokenKind } from './lib/api'
import { AuthProviders } from './lib/auth'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // 4xx hatalarını tekrar deneme (yetki/doğrulama), ağ hatalarını bir kez dene.
      retry: (failureCount, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 1,
    },
  },
})

// Oturum değiştiğinde (çıkış, başka kullanıcıyla giriş, başka sekmede değişiklik) o oturuma ait
// önbelleği sil: bir kullanıcı diğerinin verisini görmesin. 'public' sorgular kalır.
const SESSION_QUERY_ROOT: Record<TokenKind, string> = { staff: 'admin', platform: 'platform', customer: 'customer' }
const lastTokens: Record<TokenKind, string | null> = {
  staff: tokenStore.get('staff'),
  platform: tokenStore.get('platform'),
  customer: tokenStore.get('customer'),
}
function syncSessionCache() {
  for (const kind of Object.keys(lastTokens) as TokenKind[]) {
    const current = tokenStore.get(kind)
    if (current !== lastTokens[kind]) {
      lastTokens[kind] = current
      queryClient.removeQueries({ queryKey: [SESSION_QUERY_ROOT[kind]] })
    }
  }
}
window.addEventListener(AUTH_EVENT, syncSessionCache)
window.addEventListener('storage', syncSessionCache)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProviders>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProviders>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
