// Panel sayfalarının ortak yardımcıları (sayfa değildir; rota yoktur).
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '../../components/ui/Button'
import { adminApi, errorMessage } from '../../lib/api'
import { cn } from '../../lib/cn'

/** Pazartesi-ilk gösterim sırası; dow = JS getDay() (0=Pazar). */
export const WEEK_DAYS: { dow: number; label: string; short: string }[] = [
  { dow: 1, label: 'Pazartesi', short: 'Pzt' },
  { dow: 2, label: 'Salı', short: 'Sal' },
  { dow: 3, label: 'Çarşamba', short: 'Çar' },
  { dow: 4, label: 'Perşembe', short: 'Per' },
  { dow: 5, label: 'Cuma', short: 'Cum' },
  { dow: 6, label: 'Cumartesi', short: 'Cmt' },
  { dow: 0, label: 'Pazar', short: 'Paz' },
]

export const qk = {
  dashboard: ['admin', 'dashboard'] as const,
  appointments: ['admin', 'appointments'] as const,
  customers: ['admin', 'customers'] as const,
  services: ['admin', 'services'] as const,
  staff: ['admin', 'staff'] as const,
  paymentMethods: ['admin', 'payment-methods'] as const,
  workingHours: ['admin', 'working-hours'] as const,
  timeOff: ['admin', 'time-off'] as const,
  settings: ['admin', 'settings'] as const,
  whatsapp: ['admin', 'whatsapp'] as const,
  reports: ['admin', 'reports'] as const,
}

export function useStaffList() {
  return useQuery({ queryKey: qk.staff, queryFn: adminApi.listStaff, staleTime: 60_000 })
}

/** Yalnızca aktif (işten ayrılmamış) ekip: yeni randevu, çalışma saati, hizmet atama vb. */
export function useActiveStaffList() {
  return useQuery({
    queryKey: qk.staff,
    queryFn: adminApi.listStaff,
    staleTime: 60_000,
    select: (all) => all.filter((s) => s.is_active),
  })
}

/** Filtre <select>'i için: aktifler düz, işten ayrılanlar "Eski personel" grubunda. */
export function StaffOptions({ staff }: { staff: { id: number; name: string; surname: string; is_active: boolean }[] }) {
  const name = (s: { name: string; surname: string }) => `${s.name} ${s.surname}`.trim()
  const former = staff.filter((s) => !s.is_active)
  return (
    <>
      {staff
        .filter((s) => s.is_active)
        .map((s) => (
          <option key={s.id} value={s.id}>
            {name(s)}
          </option>
        ))}
      {former.length > 0 && (
        <optgroup label="Eski personel">
          {former.map((s) => (
            <option key={s.id} value={s.id}>
              {name(s)}
            </option>
          ))}
        </optgroup>
      )}
    </>
  )
}

export function useServiceList() {
  return useQuery({ queryKey: qk.services, queryFn: adminApi.listServices, staleTime: 60_000 })
}

export function usePaymentMethodList() {
  return useQuery({ queryKey: qk.paymentMethods, queryFn: adminApi.listPaymentMethods, staleTime: 60_000 })
}

/** Sorgu hatası bloğu + yeniden dene. */
export function ErrorBlock({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-start gap-3 rounded-md border border-danger/40 bg-danger/10 p-4 sm:flex-row sm:items-center', className)}
    >
      <TriangleAlert className="size-5 shrink-0 text-danger" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm text-cream">{errorMessage(error, 'Veriler yüklenemedi.')}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} leftIcon={<RefreshCw className="size-4" />}>
          Tekrar dene
        </Button>
      )}
    </div>
  )
}

/** Küçük bölüm başlığı (liste grupları için). */
export function SectionLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">{children}</h2>
      {aside}
    </div>
  )
}

export function telHref(phone: string): string {
  return `tel:+90${phone.replace(/\D/g, '').replace(/^0/, '')}`
}

/** HH:MM:SS | HH:MM -> HH:MM */
export function hhmm(t: string): string {
  return t.slice(0, 5)
}
