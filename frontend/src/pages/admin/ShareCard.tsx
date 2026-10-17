// "Randevu adresiniz": müşterilere verilecek adres + WhatsApp'ta paylaşma + vitrine asılacak yazdırılabilir QR afişi. Yalnızca yönetici/sahip.
import { useQuery } from '@tanstack/react-query'
import { Check, Copy, Download, MessageCircle, Printer, QrCode } from 'lucide-react'
import { useState } from 'react'
import { Button, buttonStyles } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { adminApi } from '../../lib/api'
import { useTenant } from '../../lib/queries'

export function ShareCard() {
  const toast = useToast()
  const tenant = useTenant()
  const link = useQuery({ queryKey: ['admin', 'site-link'], queryFn: adminApi.getSiteLink, staleTime: 10 * 60_000, retry: false })
  const [copied, setCopied] = useState(false)
  const [poster, setPoster] = useState(false)
  const shop = tenant.data?.business_name ?? 'Randevu'
  const d = link.data
  if (!d) return null

  async function copy() {
    try {
      await navigator.clipboard.writeText(d!.url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Kopyalanamadı. Adresi elle seçip kopyalayabilirsiniz.')
    }
  }
  const waText = encodeURIComponent(`${shop} online randevu: ${d.url}`)

  return (
    <>
      <Card className="mb-6">
        <CardHeader title="Randevu adresiniz" description="Müşterileriniz bu adresten kendileri randevu alır. Instagram, WhatsApp ve haritada paylaşın." />
        <p className="break-all rounded-sm border border-line bg-surface px-3.5 py-3 font-medium text-cream">{d.url}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void copy()} leftIcon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}>
            {copied ? 'Kopyalandı' : 'Kopyala'}
          </Button>
          <a href={`https://wa.me/?text=${waText}`} target="_blank" rel="noopener noreferrer" className={buttonStyles({ variant: 'secondary' })}>
            <MessageCircle className="size-4" aria-hidden="true" />
            WhatsApp ile paylaş
          </a>
          <Button variant="secondary" onClick={() => setPoster(true)} leftIcon={<QrCode className="size-4" />}>
            QR kod ve afiş
          </Button>
        </div>
      </Card>

      <Modal
        open={poster}
        onClose={() => setPoster(false)}
        title="QR kod ve afiş"
        size="md"
        description="Vitrine ya da kasaya asın; müşteriniz telefonuyla okutup randevu alsın."
        footer={
          <>
            <a href={d.qr} download={`${shop}-qr.svg`} className={buttonStyles({ variant: 'secondary' })}>
              <Download className="size-4" aria-hidden="true" />
              QR'ı indir (SVG)
            </a>
            <Button onClick={() => window.print()} leftIcon={<Printer className="size-4" />}>
              Afişi yazdır
            </Button>
          </>
        }
      >
        {/* Baskıda tek görünen alan: A4/A5 dikey afiş. Renkler bilerek sabit (siyah-beyaz, her yazıcıda net). */}
        <div id="poster" className="mx-auto flex max-w-sm flex-col items-center rounded-md border border-line bg-white px-6 py-8 text-center text-black">
          <p className="font-display text-3xl font-medium leading-tight">{shop}</p>
          <p className="mt-2 text-lg">Randevu için okutun</p>
          <img src={d.qr} alt={`${shop} randevu QR kodu`} className="my-6 w-full max-w-[18rem]" />
          <p className="break-all text-base font-medium">{d.url}</p>
          <p className="mt-6 text-xs text-neutral-500">Telefonunuzun kamerasını QR koda tutun</p>
        </div>
      </Modal>
    </>
  )
}
