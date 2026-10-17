// Bu cihazda randevu alınmış numaralar ve adları (yalnızca tarayıcıda, sunucuya gitmez). Numara tam yazılınca ad-soyad dolsun diye.
// Güvenlik: sunucudan ad getirilmez (doğrulanmamış numaradan ad sızdırmamak için); yalnızca bu cihazın kendi geçmişi kullanılır.
const KEY = 'beh.known_contacts'
const MAX = 5

export interface KnownContact {
  phone: string
  name: string
  surname: string
}

function read(): KnownContact[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (Array.isArray(raw)) {
      return raw.filter((c): c is KnownContact => !!c && typeof c.phone === 'string' && typeof c.name === 'string' && typeof c.surname === 'string')
    }
  } catch {
    /* depolama kapalı ya da bozuk */
  }
  return []
}

export function lookupContact(phone: string): KnownContact | null {
  return read().find((c) => c.phone === phone) ?? null
}

export function rememberContact(phone: string, name: string, surname: string): void {
  if (!/^\d{10}$/.test(phone) || !name.trim() || !surname.trim()) return
  const next = [{ phone, name: name.trim(), surname: surname.trim() }, ...read().filter((c) => c.phone !== phone)].slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* yoksay */
  }
}
