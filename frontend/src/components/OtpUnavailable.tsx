import { TriangleAlert } from 'lucide-react'
import { ContactLinks, type ContactInfo } from './ContactLinks'

/** İşletmenin WhatsApp'ı bağlı değilken (otp_available=false) kod adımı yerine gösterilir. */
export function OtpUnavailable({ info }: { info: ContactInfo | undefined | null }) {
  return (
    <div className="rounded-sm border border-warning/40 bg-warning/5 px-4 py-3.5" role="status">
      <p className="flex items-start gap-2.5 text-sm text-warning">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Bu işletmede online randevu şu an kullanılamıyor. Lütfen işletmeyi arayın.
      </p>
      <ContactLinks info={info ? { contact_phone: info.contact_phone, whatsapp_phone: info.whatsapp_phone } : null} variant="list" className="mt-2 pl-6" />
    </div>
  )
}
