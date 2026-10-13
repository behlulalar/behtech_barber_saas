// Booking ve MyAppointments sayfalarının paylaştığı OTP kod doğrulama formu.
import { useMutation } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { useToast } from '../../components/ui/Toast'
import { errorMessage, publicApi } from '../../lib/api'
import { formatPhone } from '../../lib/format'
import type { VerifyCodeResponse } from '../../types/api'

const RESEND_SECONDS = 60

interface Props {
  /** 10 haneli normalize telefon */
  phone: string
  /** İlk gönderimde dönen geliştirme kodu (yalnızca dev ortamında dolu). */
  initialDevCode?: string | null
  onVerified: (resp: VerifyCodeResponse) => void
  /** Numarayı değiştir */
  onBack: () => void
  /** Gönder butonunu sticky bar'a taşımak için form id'si; verilmezse buton formun içinde. */
  formId?: string
  hideSubmit?: boolean
  onCodeChange?: (code: string) => void
  onPendingChange?: (pending: boolean) => void
  submitLabel?: string
}

export function OtpCodeForm({
  phone,
  initialDevCode = null,
  onVerified,
  onBack,
  formId,
  hideSubmit,
  onCodeChange,
  onPendingChange,
  submitLabel = 'Doğrula',
}: Props) {
  const toast = useToast()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [devCode, setDevCode] = useState<string | null>(initialDevCode)
  const [cooldown, setCooldown] = useState(RESEND_SECONDS)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => window.clearTimeout(t)
  }, [cooldown])

  const verify = useMutation({
    mutationFn: () => publicApi.verifyCode({ phone, code }),
    onSuccess: onVerified,
    onError: (err) => setError(errorMessage(err)),
  })

  const resend = useMutation({
    mutationFn: () => publicApi.sendCode({ phone }),
    onSuccess: (res) => {
      setDevCode(res.dev_code)
      setCooldown(RESEND_SECONDS)
      setError(null)
      toast.success('Yeni kod gönderildi')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  useEffect(() => {
    onPendingChange?.(verify.isPending)
  }, [verify.isPending, onPendingChange])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (code.length < 4) {
      setError('Lütfen telefonunuza gelen kodu girin.')
      return
    }
    setError(null)
    verify.mutate()
  }

  return (
    <form id={formId} onSubmit={submit} noValidate className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full border border-line-strong text-copper">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </span>
        <p className="min-w-0 text-sm leading-relaxed text-muted-strong">
          <span className="whitespace-nowrap font-medium text-cream">{formatPhone(phone)}</span> numarasına bir
          doğrulama kodu gönderdik. Kodu aşağıya girin.
        </p>
      </div>

      <Field label="Doğrulama kodu" error={error}>
        <Input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 6)
            setCode(v)
            onCodeChange?.(v)
            if (error) setError(null)
          }}
          className="text-center font-display text-2xl tracking-[0.45em]"
          autoFocus
        />
      </Field>

      {devCode && (
        <div className="rounded-sm border border-dashed border-warning/50 bg-warning/5 px-3.5 py-2.5 text-xs text-warning">
          Geliştirme ortamı kodu: <span className="font-semibold tracking-widest">{devCode}</span>
        </div>
      )}

      {!hideSubmit && (
        <Button type="submit" size="lg" fullWidth loading={verify.isPending}>
          {submitLabel}
        </Button>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 items-center text-sm text-muted-strong underline-offset-4 hover:text-cream hover:underline"
        >
          Numarayı değiştir
        </button>
        <button
          type="button"
          disabled={cooldown > 0 || resend.isPending}
          onClick={() => resend.mutate()}
          className="inline-flex min-h-11 items-center text-sm text-copper-bright underline-offset-4 hover:underline disabled:text-muted disabled:no-underline"
        >
          {cooldown > 0 ? `Yeniden gönder (${cooldown} sn)` : 'Kodu yeniden gönder'}
        </button>
      </div>
    </form>
  )
}
