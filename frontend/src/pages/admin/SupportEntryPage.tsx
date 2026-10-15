import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { buttonStyles } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { authApi, errorMessage, tokenStore } from '../../lib/api'
import { PRODUCT_NAME, useDocumentTitle } from '../../lib/head'

/** Platform panelinden gelen tek kullanımlık destek kodunu oturuma çevirir (`/panel/destek?code=…`). */
export default function SupportEntryPage() {
  useDocumentTitle('Destek girişi', PRODUCT_NAME)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  // Kod tek kullanımlık: StrictMode'un çift effect çalıştırması ikinci denemede hata göstermesin.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const code = params.get('code')
    // Kod adres çubuğunda/geçmişte kalmasın.
    window.history.replaceState(null, '', window.location.pathname)
    if (!code) {
      setError('Destek bağlantısı geçersiz veya süresi dolmuş')
      return
    }
    authApi
      .impersonate(code)
      .then((res) => {
        tokenStore.set('staff', res.access_token)
        navigate('/panel', { replace: true })
      })
      .catch((err) => setError(errorMessage(err, 'Destek bağlantısı geçersiz veya süresi dolmuş')))
  }, [params, navigate])

  if (!error) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-ink px-5 text-center">
        <Spinner size="lg" label="Destek oturumu açılıyor" />
        <p className="text-sm text-muted">Destek oturumu açılıyor…</p>
      </div>
    )
  }
  return (
    <div className="pt-safe pb-safe flex min-h-dvh flex-col items-center justify-center bg-ink px-5 text-center">
      <p className="eyebrow">Destek girişi</p>
      <h1 className="mt-4 font-display text-3xl font-medium text-cream">Oturum açılamadı</h1>
      <p role="alert" className="mt-3 max-w-sm text-muted">{error}</p>
      <Link to="/panel/giris" className={buttonStyles({ size: 'lg', className: 'mt-8' })}>
        Giriş sayfasına git
      </Link>
    </div>
  )
}
