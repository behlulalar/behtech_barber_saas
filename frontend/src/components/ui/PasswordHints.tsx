import { Check, Circle } from 'lucide-react'
import { passwordChecks } from '../../lib/passwordPolicy'

/** Yeni şifre kuralları için canlı ipucu listesi. */
export function PasswordHints({ password, phone, confirm }: { password: string; phone?: string; confirm?: string }) {
  const items = passwordChecks(password, phone)
  if (confirm !== undefined) items.push({ key: 'match', label: 'Şifreler eşleşiyor', ok: password !== '' && password === confirm })
  return (
    <ul className="flex flex-col gap-1" aria-label="Şifre kuralları">
      {items.map((c) => (
        <li key={c.key} className={`flex items-center gap-2 text-xs ${c.ok ? 'text-success' : 'text-muted'}`}>
          {c.ok ? <Check className="size-3.5 shrink-0" aria-hidden="true" /> : <Circle className="size-3.5 shrink-0" aria-hidden="true" />}
          <span>{c.label}</span>
          <span className="sr-only">{c.ok ? '(sağlandı)' : '(sağlanmadı)'}</span>
        </li>
      ))}
    </ul>
  )
}
