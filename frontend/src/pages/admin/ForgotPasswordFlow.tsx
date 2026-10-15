import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { PasswordHints } from '../../components/ui/PasswordHints'
import { PhoneInput } from '../../components/ui/PhoneInput'
import { useToast } from '../../components/ui/Toast'
import { authApi, errorMessage } from '../../lib/api'
import { isValidPhone, normalizePhone } from '../../lib/format'
import { passwordValid } from '../../lib/passwordPolicy'
import { OtpCodeForm } from '../public/OtpCodeForm'

type Step = 'phone' | 'code' | 'password'

/** Şifremi unuttum: telefon -> WhatsApp kodu -> yeni şifre. Bitince onDone (girişe dön). */
export function ForgotPasswordFlow({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const toast = useToast()
  const [step, setStep] = useState<Step>('phone')
  const [phoneInput, setPhoneInput] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const phone = normalizePhone(phoneInput)

  const send = useMutation({
    mutationFn: () => authApi.forgotSendCode(phone),
    onSuccess: (res) => {
      setDevCode(res.dev_code)
      setError(null)
      setStep('code')
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const reset = useMutation({
    mutationFn: () => authApi.forgotReset({ phone, code, new_password: password }),
    onSuccess: () => {
      toast.success('Şifreniz değiştirildi. Yeni şifrenizle giriş yapabilirsiniz.')
      onDone()
    },
    onError: (err) => setError(errorMessage(err)),
  })

  function submitPhone(e: FormEvent) {
    e.preventDefault()
    if (!isValidPhone(phoneInput)) {
      setError('Geçerli bir telefon numarası girin (5XXXXXXXXX).')
      return
    }
    setError(null)
    send.mutate()
  }

  function submitPassword(e: FormEvent) {
    e.preventDefault()
    if (!passwordValid(password, phone) || password !== confirm) {
      setError('Lütfen şifre kurallarını sağlayın ve iki şifrenin aynı olduğundan emin olun.')
      return
    }
    setError(null)
    reset.mutate()
  }

  const errorBox = error && (
    <p role="alert" className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger">
      {error}
    </p>
  )

  if (step === 'code') {
    return (
      <div className="flex flex-col gap-4">
        <OtpCodeForm
          phone={phone}
          initialDevCode={devCode}
          intro="Numara kayıtlıysa WhatsApp ile bir doğrulama kodu gönderdik. Kodu aşağıya girin."
          backLabel="Numarayı değiştir"
          resendCode={() => authApi.forgotSendCode(phone)}
          onCodeEntered={(c) => {
            setCode(c)
            setError(null)
            setStep('password')
          }}
          onBack={() => setStep('phone')}
          submitLabel="Devam"
        />
      </div>
    )
  }

  if (step === 'password') {
    return (
      <form onSubmit={submitPassword} className="flex flex-col gap-5" noValidate>
        <Field label="Yeni şifre" required>
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </Field>
        <Field label="Yeni şifre (tekrar)" required>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <PasswordHints password={password} phone={phone} confirm={confirm} />
        {errorBox}
        <Button type="submit" size="lg" fullWidth loading={reset.isPending} disabled={!password || !confirm}>
          Şifreyi değiştir
        </Button>
        <button type="button" onClick={() => setStep('code')} className="min-h-11 text-sm text-muted-strong hover:text-cream hover:underline">
          Kodu yeniden gir
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={submitPhone} className="flex flex-col gap-5" noValidate>
      <Field label="Telefon" required hint="Hesabınıza kayıtlı numaraya WhatsApp ile doğrulama kodu göndeririz.">
        <PhoneInput autoComplete="username" value={phoneInput} onValueChange={setPhoneInput} />
      </Field>
      {errorBox}
      <Button type="submit" size="lg" fullWidth loading={send.isPending} disabled={!phoneInput}>
        Kod gönder
      </Button>
      <button type="button" onClick={onCancel} className="min-h-11 text-sm text-muted-strong hover:text-cream hover:underline">
        Girişe dön
      </button>
    </form>
  )
}
