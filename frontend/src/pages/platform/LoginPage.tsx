import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { PhoneInput } from '../../components/ui/PhoneInput'
import AuthLayout from '../../layouts/AuthLayout'
import { PRODUCT_NAME, useDocumentTitle } from '../../lib/head'
import { errorMessage } from '../../lib/api'
import { usePlatformAuth } from '../../lib/auth'
import { usePlatformManifest } from '../../lib/push'
import { isValidPhone, normalizePhone } from '../../lib/format'

export default function LoginPage() {
  useDocumentTitle('Platform girişi', PRODUCT_NAME)
  usePlatformManifest()
  const { status, login } = usePlatformAuth()

  const location = useLocation()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/platform'
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
      brand="BehTech Randevu"
      eyebrow="Platform"
      title="Platform girişi."
      subtitle="İşletmeleri yönetmek için platform hesabınızla giriş yapın."
    >
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
