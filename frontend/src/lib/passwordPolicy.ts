/** Backend (app/core/password_policy.py) ile aynı kurallar; yalnızca canlı ipucu içindir, asıl doğrulama sunucuda. */
const COMMON = new Set(['12345678', '123456789', '1234567890', 'password', '11111111', '00000000', 'qwerty123'])

export interface PolicyCheck {
  key: string
  label: string
  ok: boolean
}

export function passwordChecks(password: string, phone?: string): PolicyCheck[] {
  return [
    { key: 'len', label: 'En az 8 karakter', ok: password.length >= 8 },
    { key: 'phone', label: 'Telefon numaranızla aynı değil', ok: password !== '' && password !== phone },
    {
      key: 'common',
      label: 'Yaygın bir şifre değil',
      ok: password !== '' && !COMMON.has(password.toLowerCase()) && new Set(password).size > 1,
    },
  ]
}

export function passwordValid(password: string, phone?: string): boolean {
  return passwordChecks(password, phone).every((c) => c.ok)
}
