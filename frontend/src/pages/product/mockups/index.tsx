// GEÇİCİ İSKELET — mockup ajanı bu dosyayı gerçek bileşenlerle değiştirecek.
// Sözleşme: üç bileşen de { className?: string } alır, sabit en-boy oranlı ve kendi içinde
// ölçeklenir (genişliği ebeveyn belirler), dışarıdan veri/ağ isteği kullanmaz.

interface MockupProps {
  className?: string
}

/** Telefon çerçevesi içinde müşterinin randevu alma akışı. */
export function PhoneBookingMockup({ className }: MockupProps) {
  return <div className={className} style={{ aspectRatio: '9 / 19' }} />
}

/** Personel panelinin günlük ajandası (tarayıcı/tablet çerçevesi). */
export function PanelMockup({ className }: MockupProps) {
  return <div className={className} style={{ aspectRatio: '16 / 10' }} />
}

/** Dükkâna özel site: kendi adresi, logosu, kapağı ve ekibiyle (tarayıcı çerçevesi). */
export function TenantSiteMockup({ className }: MockupProps) {
  return <div className={className} style={{ aspectRatio: '16 / 10' }} />
}
