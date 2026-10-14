import { Link } from 'react-router-dom'
import { buttonStyles } from '../components/ui/Button'
import { PRODUCT_NAME, useDocumentTitle } from '../lib/head'

export default function NotFoundPage() {
  useDocumentTitle('Sayfa bulunamadı', PRODUCT_NAME)
  return (
    <div className="pt-safe pb-safe flex min-h-dvh flex-col items-center justify-center bg-ink px-5 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-4 font-display text-4xl font-medium text-cream md:text-5xl">Sayfa bulunamadı.</h1>
      <p className="mt-3 max-w-sm text-muted">Aradığınız sayfa taşınmış ya da hiç var olmamış olabilir.</p>
      <Link to="/" className={buttonStyles({ size: 'lg', className: 'mt-8' })}>
        Ana sayfaya dön
      </Link>
    </div>
  )
}
