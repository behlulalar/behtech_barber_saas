import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Spinner } from './components/ui/Spinner'
import AdminLayout from './layouts/AdminLayout'
import PlatformLayout from './layouts/PlatformLayout'
import PublicLayout from './layouts/PublicLayout'
import { RequirePlatform, RequireStaff } from './lib/auth'

const LandingPage = lazy(() => import('./pages/public/LandingPage'))
const BookingPage = lazy(() => import('./pages/public/BookingPage'))
const MyAppointmentsPage = lazy(() => import('./pages/public/MyAppointmentsPage'))

const AdminLoginPage = lazy(() => import('./pages/admin/LoginPage'))
const AdminDashboardPage = lazy(() => import('./pages/admin/DashboardPage'))
const AdminAppointmentsPage = lazy(() => import('./pages/admin/AppointmentsPage'))
const AdminCustomersPage = lazy(() => import('./pages/admin/CustomersPage'))
const AdminServicesPage = lazy(() => import('./pages/admin/ServicesPage'))
const AdminStaffPage = lazy(() => import('./pages/admin/StaffPage'))
const AdminSchedulePage = lazy(() => import('./pages/admin/SchedulePage'))
const AdminPaymentMethodsPage = lazy(() => import('./pages/admin/PaymentMethodsPage'))
const AdminSettingsPage = lazy(() => import('./pages/admin/SettingsPage'))

const PlatformLoginPage = lazy(() => import('./pages/platform/LoginPage'))
const PlatformDashboardPage = lazy(() => import('./pages/platform/DashboardPage'))
const PlatformTenantsPage = lazy(() => import('./pages/platform/TenantsPage'))

const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

function PageFallback() {
  return (
    <div className="flex min-h-[50svh] items-center justify-center">
      <Spinner size="lg" />
    </div>
  )
}

function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Müşteri tarafı */}
        <Route element={<PublicLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="randevu" element={<BookingPage />} />
          <Route path="randevularim" element={<MyAppointmentsPage />} />
        </Route>

        {/* Personel paneli */}
        <Route path="panel/giris" element={<AdminLoginPage />} />
        <Route path="panel" element={<RequireStaff />}>
          <Route element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="randevular" element={<AdminAppointmentsPage />} />
            <Route path="musteriler" element={<AdminCustomersPage />} />
            <Route path="hizmetler" element={<AdminServicesPage />} />
            <Route path="ekip" element={<AdminStaffPage />} />
            <Route path="calisma-saatleri" element={<AdminSchedulePage />} />
            <Route path="odeme-yontemleri" element={<AdminPaymentMethodsPage />} />
            <Route path="ayarlar" element={<AdminSettingsPage />} />
          </Route>
        </Route>

        {/* Platform */}
        <Route path="platform/giris" element={<PlatformLoginPage />} />
        <Route path="platform" element={<RequirePlatform />}>
          <Route element={<PlatformLayout />}>
            <Route index element={<PlatformDashboardPage />} />
            <Route path="isletmeler" element={<PlatformTenantsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}

export default App
