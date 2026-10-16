import { useEffect, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Checkbox } from '../../components/ui/Checkbox'
import { RememberedAccount } from '../../components/RememberedAccount'
import { Spinner } from '../../components/ui/Spinner'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { PhoneInput } from '../../components/ui/PhoneInput'
import { ThemeToggle } from '../../lib/theme'
import AuthLayout from '../../layouts/AuthLayout'
import { ApiError, authApi, errorMessage } from '../../lib/api'
import { clearPanelKey, setPanelKey } from '../../lib/panelKey'
import NotFoundPage from '../NotFoundPage'
import { useStaffAuth } from '../../lib/auth'
import { isValidPhone, normalizePhone } from '../../lib/format'
import { useTenant } from '../../lib/queries'
import { ForgotPasswordFlow } from './ForgotPasswordFlow'
import { useDocumentTitle, useFavicon, useNoIndex } from '../../lib/head'

function LoginForm() {
  useNoIndex()
  const { status, login, logout, me } = useStaffAuth()
  const tenant = useTenant()
  useDocumentTitle('Personel girişi', tenant.data?.business_name)
  useFavicon(tenant.data?.logo_image)
  const location = useLocation()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [remember, setRemember] = useState(true)
  const [justLoggedIn, setJustLoggedIn] = useState(false)
  const navigate = useNavigate()
  const [forgot, setForgot] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/panel'
  // Giriş formundan yeni girildiyse doğrudan panele; yoksa hesap kartı gösterilir.
  if (justLoggedIn && status === 'authenticated') return <Navigate to={from} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!isValidPhone(phone)) {
      setError('Geçerli bir telefon numarası girin (5XXXXXXXXX).')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await login(normalizePhone(phone), password, remember)
      setJustLoggedIn(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
    <div className="pt-safe fixed right-3 top-3 z-10"><ThemeToggle /></div>
    <AuthLayout
      brand={tenant.data?.business_name}
      eyebrow={forgot ? 'Şifre sıfırlama' : 'Personel girişi'}
      title={forgot ? 'Şifremi unuttum' : 'Tekrar hoş geldiniz.'}
      subtitle={forgot ? 'Telefon numaranıza gelen kodla yeni bir şifre belirleyin.' : 'Randevuları yönetmek için telefon numaranız ve şifrenizle giriş yapın.'}
    >
      {forgot ? (
        <ForgotPasswordFlow onDone={() => setForgot(false)} onCancel={() => setForgot(false)} />
      ) : (
      status === 'loading' ? (
        <div className="flex justify-center py-8"><Spinner label="Yükleniyor" /></div>
      ) : status === 'authenticated' && !justLoggedIn ? (
        <RememberedAccount
          name={`${me?.name ?? ''} ${me?.surname ?? ''}`.trim()}
          detail={me?.role === 'super_admin' ? 'İşletme sahibi' : 'Personel'}
          onContinue={() => navigate(from, { replace: true })}
          onSwitch={logout}
        />
      ) : (
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <Field label="Telefon" required>
          <PhoneInput
            autoComplete="username"
            value={phone}
            onValueChange={setPhone}
          />
        </Field>
        <Field label="Şifre" required>
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Checkbox label="Beni hatırla" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        {error && (
          <p role="alert" className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" fullWidth loading={loading} disabled={!password || !phone}>
          Giriş yap
        </Button>
        <button type="button" onClick={() => { setError(null); setForgot(true) }} className="-mt-2 min-h-11 text-sm text-muted-strong underline-offset-4 hover:text-cream hover:underline">
          Şifremi unuttum
        </button>
      </form>
      )
      )}
    </AuthLayout>
    </>
  )
}

/** Gizli giriş adresi: anahtar sunucuda doğrulanmadan form hiç görünmez (yanlışsa 404 sayfası). */
export default function LoginPage() {
  useNoIndex()
  const { key = '' } = useParams()
  const verify = useQuery({
    queryKey: ['panel-key', key],
    queryFn: async () => {
      await authApi.verifyPanelKey(key)
      return true
    },
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  })
  const status = verify.error instanceof ApiError ? verify.error.status : null
  const valid = verify.isSuccess

  useEffect(() => {
    if (valid) setPanelKey(key)
    else if (status === 404) clearPanelKey()
  }, [valid, status, key])

  if (verify.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink">
        <Spinner size="lg" label="Yükleniyor" />
      </div>
    )
  }
  if (status === 404) return <NotFoundPage />
  if (verify.isError) {
    return (
      <main className="pt-safe pb-safe flex min-h-dvh flex-col items-center justify-center bg-ink px-5 text-center">
        <h1 className="font-display text-3xl font-medium text-cream">
          {status === 429 ? 'Çok fazla deneme.' : 'Şu an bağlanılamıyor.'}
        </h1>
        <p role="alert" className="mt-3 max-w-sm text-muted">
          {status === 429 ? 'Çok fazla deneme, daha sonra tekrar deneyin.' : errorMessage(verify.error)}
        </p>
        {status !== 429 && (
          <Button size="lg" className="mt-8" onClick={() => void verify.refetch()}>
            Tekrar dene
          </Button>
        )}
      </main>
    )
  }
  return <LoginForm />
}
