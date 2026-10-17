// Türkçe biçimlendirme + YEREL tarih yardımcıları.
// KURAL: Tarih string'i üretmek için asla toISOString().slice(0,10) kullanma (UTC'dir),
// görüntüleme için asla new Date('YYYY-MM-DD') kullanma (UTC olarak parse edilir).

const pad = (n: number) => String(n).padStart(2, '0')

/* ---------- Yerel tarih yardımcıları ---------- */

/** Date -> 'YYYY-MM-DD' (yerel saat dilimine göre). */
export function toLocalISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Bugünün yerel tarihi, 'YYYY-MM-DD'. */
export function todayLocalISO(): string {
  return toLocalISO(new Date())
}

/** 'YYYY-MM-DD' -> yerel gece yarısı Date. Geçersizse bugün. */
export function parseISODateLocal(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return new Date(new Date().setHours(0, 0, 0, 0))
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** ISO tarihe gün ekler (negatif olabilir). */
export function addDaysISO(iso: string, days: number): string {
  const d = parseISODateLocal(iso)
  d.setDate(d.getDate() + days)
  return toLocalISO(d)
}

/** İki ISO tarih arasındaki gün farkı (b - a). */
export function diffDaysISO(a: string, b: string): number {
  const ms = parseISODateLocal(b).getTime() - parseISODateLocal(a).getTime()
  return Math.round(ms / 86_400_000)
}

/** Başlangıçtan itibaren `count` günlük ISO listesi. */
export function nextDaysISO(count: number, from: string = todayLocalISO()): string[] {
  return Array.from({ length: count }, (_, i) => addDaysISO(from, i))
}

/** Haftanın Pazartesi'si (ISO), Türkiye haftası. */
export function startOfWeekISO(iso: string = todayLocalISO()): string {
  const d = parseISODateLocal(iso)
  const offset = (d.getDay() + 6) % 7
  return addDaysISO(iso, -offset)
}

/** JS getDay() kuralı: 0=Pazar ... 6=Cumartesi. */
export function dayOfWeekISO(iso: string): number {
  return parseISODateLocal(iso).getDay()
}

/** Yerel olarak randevu başlangıcı = tarih + saat. */
export function appointmentStart(date: string, time: string): Date {
  const d = parseISODateLocal(date)
  const [h, m] = time.split(':').map(Number)
  d.setHours(h || 0, m || 0, 0, 0)
  return d
}

/* ---------- Görüntüleme ---------- */

const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
const dateShortFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' })
const dateLongFmt = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })
const weekdayShortFmt = new Intl.DateTimeFormat('tr-TR', { weekday: 'short' })
const weekdayLongFmt = new Intl.DateTimeFormat('tr-TR', { weekday: 'long' })
const monthYearFmt = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' })
const numberFmt = new Intl.NumberFormat('tr-TR')

/** 450 -> "450 ₺" */
export function formatPrice(amount: number): string {
  return `${numberFmt.format(amount)} ₺`
}

export function formatNumber(n: number): string {
  return numberFmt.format(n)
}

/** "12 Ekim 2026" */
export function formatDate(iso: string): string {
  return dateFmt.format(parseISODateLocal(iso))
}

/** "12 Eki" */
export function formatDateShort(iso: string): string {
  return dateShortFmt.format(parseISODateLocal(iso))
}

/** "Pazartesi, 12 Ekim" */
export function formatDateLong(iso: string): string {
  return dateLongFmt.format(parseISODateLocal(iso))
}

/** "Pzt" */
export function formatWeekdayShort(iso: string): string {
  return weekdayShortFmt.format(parseISODateLocal(iso))
}

export function formatWeekdayLong(iso: string): string {
  return weekdayLongFmt.format(parseISODateLocal(iso))
}

/** "Ekim 2026" */
export function formatMonthYear(iso: string): string {
  return monthYearFmt.format(parseISODateLocal(iso))
}

/** ISO zaman damgası (created_at) -> "12 Ekim 2026" (yerel). */
export function formatTimestamp(ts: string): string {
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? '' : dateFmt.format(d)
}

/** ISO zaman damgası -> "bugün" / "dün" / "5 gün önce" / "3 hafta önce" / "2 ay önce"; boşsa "—". */
export function formatAgo(ts: string | null | undefined): string {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (days <= 0) return 'bugün'
  if (days === 1) return 'dün'
  if (days < 14) return `${days} gün önce`
  if (days < 60) return `${Math.floor(days / 7)} hafta önce`
  return `${Math.floor(days / 30)} ay önce`
}

/** "09:00:00" -> "09:00" */
export function formatTime(time: string): string {
  return time.slice(0, 5)
}

/** "09:00" aralığı: "09:00 – 09:45" */
export function formatTimeRange(time: string, durationMin: number): string {
  const [h, m] = time.split(':').map(Number)
  const end = h * 60 + m + durationMin
  return `${formatTime(time)} – ${pad(Math.floor(end / 60) % 24)}:${pad(end % 60)}`
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min} dk`
  const h = Math.floor(min / 60)
  const r = min % 60
  return r ? `${h} sa ${r} dk` : `${h} sa`
}

/** "Ayşe Yılmaz" */
export function fullName(p: { name: string; surname: string }): string {
  return `${p.name} ${p.surname}`.trim()
}

/** "AY" */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toLocaleUpperCase('tr-TR')
}

/* ---------- Telefon ---------- */

/** "+90 555 123 45 67", "0555..." -> "5551234567" (en fazla 10 hane). */
export function normalizePhone(input: string): string {
  let digits = input.replace(/\D/g, '')
  if (digits.startsWith('90') && digits.length > 10) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = digits.slice(1)
  return digits.slice(0, 10)
}

export function isValidPhone(input: string): boolean {
  return /^5\d{9}$/.test(normalizePhone(input))
}

/** "5551234567" -> "0555 123 45 67" */
export function formatPhone(input: string): string {
  const d = normalizePhone(input)
  if (d.length !== 10) return input
  return `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`
}

/** WhatsApp hattının kopma nedeni (backend kodu) -> Türkçe. Bilinmeyen kodlar olduğu gibi gösterilir. */
export function whatsappReasonLabel(reason: string | null | undefined): string {
  if (!reason) return ''
  const map: Record<string, string> = {
    logged_out: 'Oturum kapatıldı (cihaz kaldırılmış ya da hesap engellenmiş olabilir)',
    forbidden: 'Erişim reddedildi (hesap engellenmiş olabilir)',
    connection_lost: 'Bağlantı koptu',
    health_check: 'Periyodik kontrolde bağlantı kapalı bulundu',
  }
  return map[reason] ?? reason
}
