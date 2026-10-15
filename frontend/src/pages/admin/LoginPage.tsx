import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Checkbox } from '../../components/ui/Checkbox'
import { RememberedAccount } from '../../components/RememberedAccount'
import { Spinner } from '../../components/ui/Spinner'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { PhoneInput } from '../../components/ui/PhoneInput'
import AuthLayout from '../../layouts/AuthLayout'
import { errorMessage } from '../../lib/api'
import { useStaffAuth } from '../../lib/auth'
import { isValidPhone, normalizePhone } from '../../lib/format'
import { useTenant } from '../../lib/queries'
import { ForgotPasswordFlow } from './ForgotPasswordFlow'
import { useDocumentTitle, useFavicon } from '../../lib/head'

export default function LoginPage() {
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
  )
}
