import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Spinner } from './components/ui/Spinner'
import AdminLayout from './layouts/AdminLayout'
import PlatformLayout from './layouts/PlatformLayout'
import PublicLayout from './layouts/PublicLayout'
import { RequirePlatform, RequireStaff } from './lib/auth'
import { useClampScroll } from './lib/clampScroll'
import { isProductHost } from './lib/site'

const LandingPage = lazy(() => import('./pages/public/LandingPage'))
const BookingPage = lazy(() => import('./pages/public/BookingPage'))
const MyAppointmentsPage = lazy(() => import('./pages/public/MyAppointmentsPage'))

const AdminSupportEntryPage = lazy(() => import('./pages/admin/SupportEntryPage'))
const AdminLoginPage = lazy(() => import('./pages/admin/LoginPage'))
const AdminDashboardPage = lazy(() => import('./pages/admin/DashboardPage'))
const AdminAppointmentsPage = lazy(() => import('./pages/admin/AppointmentsPage'))
const AdminCustomersPage = lazy(() => import('./pages/admin/CustomersPage'))
const AdminServicesPage = lazy(() => import('./pages/admin/ServicesPage'))
const AdminStaffPage = lazy(() => import('./pages/admin/StaffPage'))
const AdminAccountPage = lazy(() => import('./pages/admin/AccountPage'))
const AdminSchedulePage = lazy(() => import('./pages/admin/SchedulePage'))
const AdminPaymentMethodsPage = lazy(() => import('./pages/admin/PaymentMethodsPage'))
const AdminWhatsappPage = lazy(() => import('./pages/admin/WhatsappPage'))
const AdminSettingsPage = lazy(() => import('./pages/admin/SettingsPage'))
const AdminRevenuePage = lazy(() => import('./pages/admin/RevenuePage'))

const PlatformLoginPage = lazy(() => import('./pages/platform/LoginPage'))
const PlatformDashboardPage = lazy(() => import('./pages/platform/DashboardPage'))
const PlatformApplicationsPage = lazy(() => import('./pages/platform/ApplicationsPage'))
const PlatformTenantsPage = lazy(() => import('./pages/platform/TenantsPage'))
const PlatformTenantDetailPage = lazy(() => import('./pages/platform/TenantDetailPage'))
const PlatformPaymentsPage = lazy(() => import('./pages/platform/PaymentsPage'))
const PlatformPlansPage = lazy(() => import('./pages/platform/PlansPage'))
const PlatformSettingsPage = lazy(() => import('./pages/platform/SettingsPage'))
const PlatformAdminsPage = lazy(() => import('./pages/platform/AdminsPage'))
const PlatformAuditPage = lazy(() => import('./pages/platform/AuditPage'))
const PlatformAnnouncementsPage = lazy(() => import('./pages/platform/AnnouncementsPage'))
const PlatformSystemPage = lazy(() => import('./pages/platform/SystemPage'))

const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
const TenantGate = lazy(() => import('./pages/TenantGate'))
const LegalPage = lazy(() => import('./pages/legal/LegalPage'))
const SignupPage = lazy(() => import('./pages/product/SignupPage'))
const ProductPage = lazy(() => import('./pages/product/ProductPage'))

function PageFallback() {
  return (
    <div className="flex min-h-[50svh] items-center justify-center">
      <Spinner size="lg" />
    </div>
  )
}

const platformRoutes = (
  <>
    <Route path="platform/giris" element={<PlatformLoginPage />} />
    <Route path="platform" element={<RequirePlatform />}>
      <Route element={<PlatformLayout />}>
        <Route index element={<PlatformDashboardPage />} />
        <Route path="basvurular" element={<PlatformApplicationsPage />} />
        <Route path="isletmeler" element={<PlatformTenantsPage />} />
        <Route path="isletmeler/:id" element={<PlatformTenantDetailPage />} />
        <Route path="odemeler" element={<PlatformPaymentsPage />} />
        <Route path="paketler" element={<PlatformPlansPage />} />
        <Route path="ayarlar" element={<PlatformSettingsPage />} />
        <Route path="yoneticiler" element={<PlatformAdminsPage />} />
        <Route path="denetim" element={<PlatformAuditPage />} />
        <Route path="duyurular" element={<PlatformAnnouncementsPage />} />
        <Route path="sistem" element={<PlatformSystemPage />} />
      </Route>
    </Route>
  </>
)

function App() {
  useClampScroll()
  // Ürünün tanıtım sitesi (randevu.behtechlabs.com): dükkân rotaları yok.
  if (isProductHost()) {
    return (
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route index element={<ProductPage />} />
          <Route path="kayit" element={<SignupPage />} />
          <Route path="yasal/:slug" element={<LegalPage />} />
          {platformRoutes}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="tanitim" element={<ProductPage />} />
        <Route path="kayit" element={<SignupPage />} />
        {/* Yasal metinler pasif işletmede de açılabilsin diye TenantGate dışında */}
        <Route path="yasal/:slug" element={<LegalPage />} />

        {/* Dükkân tarafı: işletme pasif/yoksa TenantGate bilgi ekranı gösterir */}
        <Route element={<TenantGate />}>
        {/* Müşteri tarafı */}
        <Route element={<PublicLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="randevu" element={<BookingPage />} />
          <Route path="randevularim" element={<MyAppointmentsPage />} />
        </Route>

        {/* Personel paneli */}
        <Route path="panel/g/:key" element={<AdminLoginPage />} />
        <Route path="panel/destek" element={<AdminSupportEntryPage />} />
        <Route path="panel" element={<RequireStaff />}>
          <Route element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="randevular" element={<AdminAppointmentsPage />} />
            <Route path="musteriler" element={<AdminCustomersPage />} />
            {/* Ekip: herkes görür, yalnızca yönetici düzenler (sayfa kendi içinde yetkiye göre davranır) */}
            <Route path="ekip" element={<AdminStaffPage />} />
            <Route path="hesabim" element={<AdminAccountPage />} />
            {/* Yalnızca yönetici (işletme sahibi): personel bu adreslere girerse Genel Bakış'a döner */}
            <Route element={<RequireStaff managerOnly />}>
              <Route path="hizmetler" element={<AdminServicesPage />} />
              <Route path="gelir" element={<AdminRevenuePage />} />
              <Route path="calisma-saatleri" element={<AdminSchedulePage />} />
              <Route path="odeme-yontemleri" element={<AdminPaymentMethodsPage />} />
              <Route path="whatsapp" element={<AdminWhatsappPage />} />
              <Route path="ayarlar" element={<AdminSettingsPage />} />
            </Route>
          </Route>
        </Route>
        </Route>

        {/* Platform */}
        {platformRoutes}

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}

export default App
