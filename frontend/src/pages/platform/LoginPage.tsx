import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Checkbox } from '../../components/ui/Checkbox'
import { RememberedAccount } from '../../components/RememberedAccount'
import { Spinner } from '../../components/ui/Spinner'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { PhoneInput } from '../../components/ui/PhoneInput'
import { ThemeToggle } from '../../lib/theme'
import AuthLayout from '../../layouts/AuthLayout'
import { PRODUCT_NAME, useDocumentTitle } from '../../lib/head'
import { errorMessage } from '../../lib/api'
import { usePlatformAuth } from '../../lib/auth'
import { usePlatformManifest } from '../../lib/push'
import { isValidPhone, normalizePhone } from '../../lib/format'

export default function LoginPage() {
  useDocumentTitle('Platform girişi', PRODUCT_NAME)
  usePlatformManifest()
  const { status, login, logout, me } = usePlatformAuth()

  const location = useLocation()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [remember, setRemember] = useState(true)
  const [justLoggedIn, setJustLoggedIn] = useState(false)
  const navigate = useNavigate()

  const from = (location.state as { from?: string } | null)?.from ?? '/platform'
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
      brand="BehTech Randevu"
      eyebrow="Platform"
      title="Platform girişi."
      subtitle="İşletmeleri yönetmek için platform hesabınızla giriş yapın."
    >
      {status === 'loading' ? (
        <div className="flex justify-center py-8"><Spinner label="Yükleniyor" /></div>
      ) : status === 'authenticated' && !justLoggedIn ? (
        <RememberedAccount
          name={me?.name ?? 'Yönetici'}
          detail={'Platform yöneticisi'}
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
      </form>
      )}
    </AuthLayout>
    </>
  )
}
