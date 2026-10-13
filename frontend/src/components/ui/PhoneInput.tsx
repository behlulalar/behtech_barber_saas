import type { ComponentProps } from 'react'
import { normalizePhone } from '../../lib/format'
import { Input } from './Input'

type PhoneInputProps = Omit<ComponentProps<typeof Input>, 'type' | 'value' | 'onChange'> & {
  value: string
  /** Her zaman temizlenmiş değerle çağrılır: sadece rakam, başta 0/+90 yok, en fazla 10 hane. */
  onValueChange: (value: string) => void
}

/**
 * 10 haneli cep telefonu alanı (5XXXXXXXXX). maxLength bilinçli olarak kullanılmıyor: tarayıcı
 * "0555 123 45 67" gibi yapıştırılan metni 10 karakterde keserdi; onun yerine değer her değişimde
 * normalize edilip 10 rakamla sınırlanıyor.
 */
export function PhoneInput({ value, onValueChange, placeholder = '5XXXXXXXXX', ...rest }: PhoneInputProps) {
  return (
    <Input
      type="tel"
      inputMode="numeric"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onValueChange(normalizePhone(e.target.value))}
      {...rest}
    />
  )
}
