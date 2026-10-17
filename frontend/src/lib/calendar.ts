// Randevuyu telefon/bilgisayar takvimine eklemek için .ics dosyası üretir (sunucuya gitmez) ve harita bağlantısı kurar.
import type { AppointmentPublicOut } from '../types/api'

const pad = (n: number) => String(n).padStart(2, '0')

/** "2026-10-18" + "10:30:00" (+ dakika) → "20261018T103000" (saat dilimsiz: cihazın yerel saati, yani Türkiye). */
function icsLocal(date: string, time: string, addMinutes = 0): string {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const total = h * 60 + mi + addMinutes
  const dt = new Date(y, mo - 1, d, 0, total)
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** RFC 5545: satırlar 75 karakteri aşmasın; uzun satır CRLF + boşlukla katlanır. */
function fold(line: string): string {
  const out: string[] = []
  let rest = line
  while (rest.length > 74) {
    out.push(rest.slice(0, 74))
    rest = ' ' + rest.slice(74)
  }
  out.push(rest)
  return out.join('\r\n')
}

export function buildIcs(a: AppointmentPublicOut, shopName: string, address?: string | null): string {
  const now = new Date()
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BehTech Randevu//TR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:randevu-${a.id}@behtech-randevu`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsLocal(a.appointment_date, a.appointment_time)}`,
    `DTEND:${icsLocal(a.appointment_date, a.appointment_time, a.service.duration_min)}`,
    `SUMMARY:${esc(`${a.service.name} – ${shopName}`)}`,
    ...(address ? [`LOCATION:${esc(`${shopName}, ${address}`)}`] : []),
    `DESCRIPTION:${esc(`Berber: ${a.staff.name} ${a.staff.surname}`)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Randevunuza 1 saat kaldı',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

export function downloadIcs(a: AppointmentPublicOut, shopName: string, address?: string | null): void {
  const blob = new Blob([buildIcs(a, shopName, address)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'randevu.ics'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function directionsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}
