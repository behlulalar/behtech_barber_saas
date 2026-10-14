import { PauseCircle, SearchX } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import { Spinner } from '../components/ui/Spinner'
import { ApiError } from '../lib/api'
import { PRODUCT_NAME, useDocumentTitle } from '../lib/head'
import { useTenant } from '../lib/queries'

/**
 * Dükkân sitesi/paneli için kapı: işletme pasifse (403, ör. abonelik nedeniyle askıya alındı) ya da
 * bu adreste işletme yoksa (404) sayfa yerine bilgi ekranı gösterir. Aksi halde ilgili sayfayı açar.
 * Platform rotaları bunun dışındadır (platform paneli işletmeden bağımsız çalışır).
 */
export default function TenantGate() {
  const tenant = useTenant()
  const status = tenant.error instanceof ApiError ? tenant.error.status : null

  if (tenant.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink">
        <Spinner size="lg" />
      </div>
    )
  }
  if (status === 403) return <Unavailable inactive />
  if (status === 404) return <Unavailable />
  return <Outlet />
}

function Unavailable({ inactive = false }: { inactive?: boolean }) {
  useDocumentTitle(inactive ? 'Hizmet verilmiyor' : 'İşletme bulunamadı', PRODUCT_NAME)
  const Icon = inactive ? PauseCircle : SearchX
  return (
    <main className="pt-safe pb-safe flex min-h-dvh flex-col items-center justify-center bg-ink px-5 text-center">
      <span className="flex size-16 items-center justify-center rounded-full border border-line-strong text-copper-bright">
        <Icon className="size-8" aria-hidden="true" />
      </span>
      <h1 className="mt-6 max-w-md font-display text-3xl font-medium text-cream md:text-4xl">
        {inactive ? 'Bu işletme şu an hizmet vermiyor.' : 'Bu adreste bir işletme bulunamadı.'}
      </h1>
      <p className="mt-3 max-w-sm text-muted">
        {inactive
          ? 'Randevu almak için lütfen işletmeyle doğrudan iletişime geçin. İşletme sahibiyseniz abonelik durumunuz için bizimle görüşebilirsiniz.'
          : 'Adresi kontrol edip tekrar deneyin.'}
      </p>
      <p className="mt-10 text-xs text-muted">{PRODUCT_NAME} altyapısıyla</p>
    </main>
  )
}
