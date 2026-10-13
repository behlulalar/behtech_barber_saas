import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import AuthLayout from '../../layouts/AuthLayout'
import { errorMessage } from '../../lib/api'
import { useStaffAuth } from '../../lib/auth'
import { isValidPhone, normalizePhone } from '../../lib/format'
import { useTenant } from '../../lib/queries'

export default function LoginPage() {
  const { status, login } = useStaffAuth()
  const tenant = useTenant()
  const location = useLocation()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/panel'
  if (status === 'authenticated') return <Navigate to={from} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!isValidPhone(phone)) {
      setError('Geçerli bir telefon numarası girin (5XXXXXXXXX).')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await login(normalizePhone(phone), password)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      brand={tenant.data?.business_name}
      eyebrow="Personel girişi"
      title="Tekrar hoş geldiniz."
      subtitle="Randevuları yönetmek için telefon numaranız ve şifrenizle giriş yapın."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <Field label="Telefon" required>
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="username"
            placeholder="5XX XXX XX XX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
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
        {error && (
          <p role="alert" className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" fullWidth loading={loading} disabled={!password || !phone}>
          Giriş yap
        </Button>
      </form>
    </AuthLayout>
  )
}
