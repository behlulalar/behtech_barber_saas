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
import { PRODUCT_NAME, useDocumentTitle, useNoIndex } from '../../lib/head'
import { ApiError, errorMessage } from '../../lib/api'
import { CodeInput } from './TwoFactor'
import { usePlatformAuth } from '../../lib/auth'
import { usePlatformManifest } from '../../lib/push'
import { isValidPhone, normalizePhone } from '../../lib/format'

export default function LoginPage() {
  useNoIndex()
  useDocumentTitle('Platform girişi', PRODUCT_NAME)
  usePlatformManifest()
  const { status, login, verifyMfa, logout, me } = usePlatformAuth()

  const location = useLocation()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [remember, setRemember] = useState(true)
  const [justLoggedIn, setJustLoggedIn] = useState(false)
  const [mfaToken, setMfaToken] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [backup, setBackup] = useState(false)
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
      const res = await login(normalizePhone(phone), password, remember)
      if (res.mfa_required && res.mfa_token) {
        setMfaToken(res.mfa_token)
        setCode('')
        setBackup(false)
      } else {
        setJustLoggedIn(true)
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function submitCode(value: string) {
    if (!mfaToken || loading) return
    setError(null)
    setLoading(true)
    try {
      await verifyMfa(mfaToken, value)
      setJustLoggedIn(true)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && /süre/i.test(err.detail)) {
        setMfaToken(null)
        setPassword('')
        setError('Doğrulama süresi doldu. Lütfen yeniden giriş yapın.')
      } else {
        setError(errorMessage(err))
      }
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  function backToPassword() {
    setMfaToken(null)
    setCode('')
    setError(null)
    setBackup(false)
  }

  function onCode(v: string) {
    setCode(v)
    if (!backup && v.length === 6) void submitCode(v)
  }

  const mfaForm = (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (code) void submitCode(code)
      }}
      className="flex flex-col gap-5"
      noValidate
    >
      <Field
        label={backup ? 'Yedek kod' : 'Doğrulama kodu'}
        hint={backup ? 'Yedek kodlarınızdan birini girin.' : 'Doğrulayıcı uygulamanızdaki 6 haneli kod.'}
        required
      >
        {backup ? (
          <Input
            key="backup"
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            value={code}
            onChange={(e) => setCode(e.target.value.slice(0, 12))}
            className="text-center font-mono text-lg tracking-widest"
          />
        ) : (
          <CodeInput key="totp" big autoFocus value={code} onChange={onCode} />
        )}
      </Field>
      {error && (
        <p role="alert" className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}
      {(backup || loading) && (
        <Button type="submit" size="lg" fullWidth loading={loading} disabled={!code}>
          Doğrula
        </Button>
      )}
      <div className="flex flex-col items-start gap-1 text-sm">
        <button
          type="button"
          className="min-h-11 text-copper-bright underline-offset-2 hover:underline"
          onClick={() => {
            setBackup((b) => !b)
            setCode('')
            setError(null)
          }}
        >
          {backup ? 'Uygulama kodunu kullan' : 'Yedek kod kullan'}
        </button>
        <button type="button" className="min-h-11 text-muted underline-offset-2 hover:text-cream hover:underline" onClick={backToPassword}>
          Geri dön
        </button>
      </div>
    </form>
  )

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
      ) : mfaToken ? (
        mfaForm
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
