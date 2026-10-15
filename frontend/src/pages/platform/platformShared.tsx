// Yöneticiler / Denetim kaydı / Sistem sayfalarının ortak küçük parçaları.
import { Check, Circle } from 'lucide-react'
import { cn } from '../../lib/cn'

const pad = (n: number) => String(n).padStart(2, '0')

/** ISO zaman damgası -> "14.10.2026 09:05" (yerel saat). */
export function formatDateTimeDMY(ts: string | null | undefined): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ServerError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
      {message}
    </p>
  )
}

/* ------------------------------ Şifre politikası ------------------------------ */

const COMMON = ['12345678', '123456789', '1234567890', 'password', '11111111', '00000000', 'qwerty123']

export interface PasswordCheck {
  minLength: boolean
  notPhone: boolean
  notCommon: boolean
  valid: boolean
}

export function checkPassword(password: string, phone?: string | null): PasswordCheck {
  const minLength = password.length >= 8
  const notPhone = !phone || password !== phone
  const lower = password.toLowerCase()
  const notCommon = password.length === 0 || !(COMMON.includes(lower) || /^(.)\1*$/.test(password))
  return { minLength, notPhone, notCommon, valid: minLength && notPhone && notCommon && password.length > 0 }
}

/** Canlı şifre ipuçları: simge + metin (renk tek başına anlam taşımaz). */
export function PasswordHints({ password, phone }: { password: string; phone?: string | null }) {
  const c = checkPassword(password, phone)
  const started = password.length > 0
  const items: [boolean, string][] = [
    [c.minLength, 'En az 8 karakter'],
    [c.notPhone && started, 'Telefon numarası olmamalı'],
    [c.notCommon && started, 'Çok yaygın bir şifre olmamalı (12345678, password gibi)'],
  ]
  return (
    <ul className="flex flex-col gap-1.5 text-xs" aria-label="Şifre kuralları">
      {items.map(([ok, text]) => (
        <li key={text} className={cn('flex items-start gap-2', ok ? 'text-success' : 'text-muted')}>
          {ok ? <Check className="mt-px size-3.5 shrink-0" aria-hidden="true" /> : <Circle className="mt-px size-3.5 shrink-0" aria-hidden="true" />}
          <span>
            {text}
            <span className="sr-only">{ok ? ' (sağlandı)' : ' (sağlanmadı)'}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
