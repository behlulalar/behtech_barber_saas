import { useQuery } from '@tanstack/react-query'
import { CalendarPlus, Phone, Search, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { buttonStyles } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input } from '../../components/ui/Input'
import { PageHeader } from '../../components/ui/PageHeader'
import { Table, type Column } from '../../components/ui/Table'
import { adminApi } from '../../lib/api'
import { formatDate, formatPhone, fullName } from '../../lib/format'
import type { AdminCustomer } from '../../types/api'
import { ErrorBlock, qk, telHref } from './shared'

const LIMIT = 200

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function PhoneLink({ phone }: { phone: string }) {
  return (
    <a href={telHref(phone)} className="inline-flex min-h-11 items-center gap-2 text-copper-bright hover:underline md:min-h-0">
      <Phone className="size-3.5" aria-hidden="true" />
      <span className="tabular-nums">{formatPhone(phone)}</span>
    </a>
  )
}

function BookLink({ c }: { c: AdminCustomer }) {
  return (
    <Link
      to="/panel/randevular"
      state={{ newAppointment: { phone: c.phone, name: c.name, surname: c.surname } }}
      aria-label={`${fullName(c)} için randevu oluştur`}
      title="Randevu oluştur"
      className={buttonStyles({ variant: 'ghost', size: 'sm', className: 'size-11 !px-0 md:size-9' })}
    >
      <CalendarPlus className="size-[18px]" />
    </Link>
  )
}

export default function CustomersPage() {
  const [input, setInput] = useState('')
  const q = useDebounced(input.trim(), 300)

  const query = useQuery({
    queryKey: [...qk.customers, q],
    queryFn: () => adminApi.listCustomers(q || undefined),
    placeholderData: (prev) => prev,
  })
  const rows = query.data ?? []

  const columns: Column<AdminCustomer>[] = [
    { key: 'name', header: 'Müşteri', primary: true, cell: (c) => <span className="font-medium">{fullName(c)}</span> },
    { key: 'phone', header: 'Telefon', cell: (c) => <PhoneLink phone={c.phone} /> },
    { key: 'count', header: 'Randevu', align: 'right', cell: (c) => <span className="tabular-nums">{c.appointment_count}</span> },
    {
      key: 'last',
      header: 'Son randevu',
      cell: (c) => (c.last_appointment_date ? formatDate(c.last_appointment_date) : <span className="text-muted">Yok</span>),
    },
    { key: 'book', header: '', align: 'right', hideOnMobile: true, className: 'w-14', cell: (c) => <BookLink c={c} /> },
  ]

  return (
    <>
      <PageHeader
        title="Müşteriler"
        description={query.data ? `${rows.length}${rows.length >= LIMIT ? '+' : ''} müşteri${q ? ' bulundu' : ''}` : 'Randevu alan herkes burada listelenir.'}
      />

      <div className="mb-5 max-w-md">
        <Input
          type="search"
          inputMode="search"
          aria-label="Müşteri ara"
          placeholder="Ad, soyad veya telefon ara"
          leading={<Search className="size-4" />}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoComplete="off"
        />
      </div>

      {query.isError ? (
        <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Table
          caption="Müşteri listesi"
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id}
          loading={query.isLoading}
          mobileActions={(c) => <BookLink c={c} />}
          empty={
            <EmptyState
              icon={<Users />}
              title={q ? 'Eşleşen müşteri yok' : 'Henüz müşteri yok'}
              description={q ? 'Farklı bir isim ya da telefon numarası deneyin.' : 'İlk randevu alındığında müşteri burada görünür.'}
            />
          }
        />
      )}
      {rows.length >= LIMIT && <p className="mt-3 text-xs text-muted">İlk {LIMIT} sonuç gösteriliyor. Aramayı daraltın.</p>}
    </>
  )
}
