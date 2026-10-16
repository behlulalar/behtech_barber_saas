// İşletmenin kendi WhatsApp bağlantısı: yalnızca WhatsApp ile ilgili her şey burada (yönetici/sahip).
import { PageHeader } from '../../components/ui/PageHeader'
import { WhatsappCard } from './WhatsappCard'

export default function WhatsappPage() {
  return (
    <>
      <PageHeader
        title="WhatsApp bağlantısı"
        description="Müşterilerinize giden doğrulama kodları ve bildirimler bu numaradan gönderilir."
      />
      <WhatsappCard />
    </>
  )
}
