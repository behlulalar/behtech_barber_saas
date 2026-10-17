import { CalendarPlus, Navigation } from 'lucide-react'
import { buttonStyles } from '../ui/Button'
import { directionsUrl, downloadIcs } from '../../lib/calendar'
import { cn } from '../../lib/cn'
import { useTenant } from '../../lib/queries'
import type { AppointmentPublicOut } from '../../types/api'

/** "Takvime ekle" (.ics) ve (adres varsa) "Yol tarifi" düğmeleri. */
export function AppointmentActions({ appointment, size = 'md', className }: { appointment: AppointmentPublicOut; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const tenant = useTenant()
  const shop = tenant.data?.business_name ?? 'Randevu'
  const address = tenant.data?.business_address
  const btn = buttonStyles({ variant: 'secondary', size })
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      <button type="button" className={btn} onClick={() => downloadIcs(appointment, shop, address)}>
        <CalendarPlus className="size-4" aria-hidden="true" />
        Takvime ekle
      </button>
      {address && (
        <a className={btn} href={directionsUrl(address)} target="_blank" rel="noopener noreferrer">
          <Navigation className="size-4" aria-hidden="true" />
          Yol tarifi
        </a>
      )}
    </div>
  )
}
