import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { ToastProvider } from './components/ui/Toast'
import { ApiError } from './lib/api'
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
