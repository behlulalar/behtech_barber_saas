# Frontend temel katman — sayfa ajanları için rehber

Sadece kendi `src/pages/<alan>/` klasörünüzde çalışın. `lib/`, `components/`, `layouts/`, `types/`, `App.tsx` dosyalarını DEĞİŞTİRMEYİN (eksik bir şey varsa raporlayın).

## Rotalar ve layout'lar
- Public (`PublicLayout`, header/footer hazır, sayfa `<Outlet/>` içinde): `/`, `/randevu`, `/randevularim`. Sayfa kendi `max-w-6xl mx-auto px-5 md:px-10` sarmalayıcısını koyar.
- Panel (`RequireStaff` > `AdminLayout`, `main` zaten `max-w-6xl` + padding'li): `/panel/*`. Sayfa doğrudan `<PageHeader/>` ile başlar. Giriş sayfası hazır.
- Platform (`RequirePlatform` > `PlatformLayout`): `/platform/*`. Giriş sayfası hazır.
- Her sayfa `export default` olmalı (lazy import).

## UI bileşenleri (`components/ui`, hepsi `index.ts`'den veya tek tek import edilir)
- `Button` {variant: primary|secondary|ghost|danger, size: sm|md|lg, loading, leftIcon, rightIcon, fullWidth}; `IconButton` {label}; `buttonStyles({variant,size})` Link'e buton görünümü vermek için.
- `Field` {label, hint, error, required} içine tek `Input|Select|Textarea` koyun (id/aria otomatik bağlanır) veya `{(a11y) => ...}` render fonksiyonu.
- `Input` {invalid, leading}, `Textarea`, `Select` (native `<option>`), `Checkbox` {label, description}, `Switch` {checked, onChange, label}.
- `Card` {padding, interactive, tone: panel|surface}, `CardHeader` {title, description, action}.
- `Badge` {tone}, `StatusBadge` {status} (+ `STATUS_LABELS`, `STATUS_ORDER`).
- `Spinner`, `Skeleton`, `SkeletonText`, `EmptyState` {icon, title, description, action}.
- `Modal` {open, onClose, title, description, footer, size: sm|md|lg, dismissible}: mobilde bottom sheet, masaüstünde ortalı; odak tuzağı/Esc/scroll kilidi dahil. Butonları `footer`'a koyun. `data-autofocus` ile ilk odak seçilebilir.
- `ConfirmDialog` {open, onClose, onConfirm, title, description, destructive, loading}.
- `Drawer`, `Tabs` {items:[{value,label,count}], value, onChange}, `SegmentedControl`.
- `Avatar` {name, src, size}, `PageHeader` {title, description, eyebrow, actions}, `StatCard` {label, value, hint, icon, tone, loading}.
- `Table<T>` {columns:[{key, header, cell, primary, hideOnMobile, align}], rows, rowKey, onRowClick, loading, empty, mobileActions}: masaüstünde tablo, <md'de kartlara dönüşür. Tam bir sütuna `primary: true` verin.
- `ToastProvider` zaten kökte; `const toast = useToast(); toast.success('Kaydedildi'); toast.error(errorMessage(err))`.
- İkonlar: `lucide-react` (emoji kullanmayın).

## API (`lib/api.ts`) — tümü tipli
`publicApi` (health, getTenant, getStaff, getServices, getAvailability({staff_id,service_id,date}), sendCode, verifyCode), `customerApi` (createAppointment, listAppointments, cancelAppointment), `authApi` (login, me), `adminApi` (getDashboard, list/create/updateAppointment, list/create/update/deleteService, list/create/update/deleteStaff, getWorkingHours, setWorkingHours(staffId, hours), list/create/deleteTimeOff, list/create/update/deletePaymentMethod, getSettings, updateSettings, listCustomers(q)), `platformApi` (login, me, getStats, listTenants, createTenant, updateTenant). Tipler: `types/api.ts`.
- Hatalar `ApiError {status, detail}`; kullanıcıya göstermek için `errorMessage(err)`.
- TanStack Query ile kullanın: `useQuery({queryKey:['admin','services'], queryFn: adminApi.listServices})`; yazma sonrası `queryClient.invalidateQueries`.
- 401 gelince token temizlenir ve ilgili giriş sayfasına yönlendirilir (otomatik). `useTenant()` (lib/queries) işletme bilgisini verir.

## Auth (`lib/auth.tsx`)
`useStaffAuth()` → {status, me, isManager, isOwner, login, logout}; `usePlatformAuth()`; `useCustomerAuth()` → {isAuthenticated, phone, customer, expiresAt, expired, login(verifyCodeResponse), logout, clearExpired}. Müşteri token'ı 30 dk; süre dolunca otomatik temizlenir, `expired` true olur. Yönetici-only UI için `isManager` ile butonları gizleyin (backend de zorlar).

## Biçimlendirme (`lib/format.ts`)
`formatPrice`, `formatDate`, `formatDateLong`, `formatDateShort`, `formatTime("09:00:00")`, `formatTimeRange`, `formatDuration`, `formatPhone`, `fullName`, `formatTimestamp`. Tarih: `todayLocalISO`, `addDaysISO`, `parseISODateLocal`, `nextDaysISO`, `startOfWeekISO`, `toLocalISO`, `dayOfWeekISO` (0=Pazar), `appointmentStart`. Telefon: `normalizePhone` (API'ye bununla gönderin), `isValidPhone`.
KURAL: `toISOString().slice(0,10)` ve görüntü için `new Date('YYYY-MM-DD')` YASAK (UTC).

## Mobil kuralları (zorunlu)
1. Form kontrolleri 16px: `Input/Select/Textarea` kullanın; ham `<input>` üzerinde `text-sm` vermeyin.
2. Yatay taşma yok: flex çocuklarına `min-w-0`, uzun metne `break-words`/`truncate`, geniş içerik kendi `overflow-x-auto` kabında. `w-screen`/`100vw` kullanmayın.
3. Tam yükseklik için `min-h-svh`/`dvh`, asla `vh`. Sabit çubuklarda `pb-safe`/`pt-safe` (veya `env(safe-area-inset-*)`).
4. Dokunma hedefleri >= 44px (`min-h-11`); bileşenler bunu zaten sağlar. Tıklanabilir div yerine `button`/`a`.
5. Görsellerde `aspect-*` verin. Tablolar için `Table` bileşeni; elle `<table>` yazmayın.
6. Modal/Drawer dışında scroll kilidi elle yapmayın (`useScrollLock` var).
7. Renkler: `bg-ink/surface/panel`, `text-cream/muted`, `copper`, durum için `success/warning/danger/info` token'ları; başlık/sayı için `font-display`. Sol kenar vurgulu kart, gradient, emoji yok.
