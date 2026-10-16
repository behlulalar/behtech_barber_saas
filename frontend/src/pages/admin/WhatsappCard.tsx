// Ayarlar: dükkânın kendi WhatsApp hesabını bağlaması (müşteri doğrulama kodları bu numaradan gider).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Field } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { PhoneInput } from '../../components/ui/PhoneInput'
import { Skeleton } from '../../components/ui/Skeleton'
import { Tabs } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/Toast'
import { adminApi, errorMessage } from '../../lib/api'
import { useStaffAuth } from '../../lib/auth'
import { isValidPhone, normalizePhone } from '../../lib/format'
import type { WhatsappConnectOut, WhatsappStatus } from '../../types/api'
import { qk } from './shared'

const QR_REFRESH_MS = 35_000

/** "905551234567" -> "+90 555 123 45 67" */
function formatWaPhone(p: string): string {
  const d = p.replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('90')) return `+90 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`
  return `+${d}`
}

function formatPairing(code: string): string {
  const c = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : code
}

function formatConnectedAt(ts: string | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function WhatsappCard() {
  const toast = useToast()
  const qc = useQueryClient()
  const { me } = useStaffAuth()
  const [connectOpen, setConnectOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [testPhone, setTestPhone] = useState(() => normalizePhone(me?.phone ?? ''))

  const status = useQuery({
    queryKey: qk.whatsapp,
    queryFn: adminApi.getWhatsapp,
    refetchInterval: connectOpen ? 3000 : false,
  })

  const disconnect = useMutation({
    mutationFn: adminApi.disconnectWhatsapp,
    onSuccess: (data) => {
      qc.setQueryData(qk.whatsapp, data)
      void qc.invalidateQueries({ queryKey: ['admin', 'setup'] })
      setConfirmOpen(false)
      toast.success('WhatsApp bağlantısı kesildi')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const test = useMutation({
    mutationFn: () => adminApi.testWhatsapp(normalizePhone(testPhone)),
    onSuccess: () => toast.success('Test mesajı gönderildi'),
    onError: (err) => toast.error(errorMessage(err)),
  })

  const s = status.data
  const connected = s?.state === 'open'

  return (
    <Card>
      <CardHeader
        title="WhatsApp bağlantısı"
        description="Müşterilerinize giden doğrulama kodları bu numaradan gönderilir."
        action={s ? <StateBadge s={s} /> : undefined}
      />
      {status.isError ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-danger">{errorMessage(status.error)}</p>
          <Button variant="secondary" onClick={() => void status.refetch()}>
            Tekrar dene
          </Button>
        </div>
      ) : !s ? (
        <Skeleton className="h-20 w-full" />
      ) : (
        <div className="flex flex-col gap-4">
          {!s.server_reachable && (
            <p className="flex items-start gap-2.5 rounded-sm border border-warning/40 bg-warning/5 px-3.5 py-3 text-sm text-warning" role="status">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              WhatsApp sunucusuna şu an ulaşılamıyor. Biraz sonra tekrar deneyin.
            </p>
          )}

          {connected ? (
            <>
              <div className="min-w-0 text-sm">
                {s.phone && <p className="font-medium tabular-nums text-cream">{formatWaPhone(s.phone)}</p>}
                {s.profile_name && <p className="break-words text-muted-strong">{s.profile_name}</p>}
                {s.connected_at && <p className="text-xs text-muted">Bağlanma: {formatConnectedAt(s.connected_at)}</p>}
              </div>

              <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <Field label="Test mesajı gönder" hint="Bu numaraya deneme mesajı gider.">
                  <PhoneInput value={testPhone} onValueChange={setTestPhone} autoComplete="off" />
                </Field>
                <Button variant="secondary" onClick={() => test.mutate()} loading={test.isPending} disabled={!isValidPhone(testPhone)}>
                  Gönder
                </Button>
              </div>

              <div>
                <Button variant="danger" onClick={() => setConfirmOpen(true)}>
                  Bağlantıyı kes
                </Button>
              </div>
            </>
          ) : (
            <div>
              <Button onClick={() => setConnectOpen(true)} disabled={!s.server_reachable}>
                WhatsApp'ı bağla
              </Button>
            </div>
          )}
        </div>
      )}

      <ConnectModal
        open={connectOpen && !connected}
        state={s?.state}
        onClose={() => setConnectOpen(false)}
        onConnected={() => {
          setConnectOpen(false)
          void qc.invalidateQueries({ queryKey: ['admin', 'setup'] })
          toast.success('WhatsApp bağlandı')
        }}
      />

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => disconnect.mutate()}
        title="Bağlantıyı kes"
        description="Kesilirse müşterileriniz doğrulama kodu alamaz, online randevu duraklar."
        confirmLabel="Bağlantıyı kes"
        destructive
        loading={disconnect.isPending}
      />
    </Card>
  )
}

function StateBadge({ s }: { s: WhatsappStatus }) {
  const dot = <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
  if (s.state === 'open')
    return (
      <Badge tone="success">
        {dot}Bağlı
      </Badge>
    )
  if (s.state === 'connecting')
    return (
      <Badge tone="warning">
        {dot}Bağlanıyor
      </Badge>
    )
  return (
    <Badge tone="neutral">
      {dot}Bağlı değil
    </Badge>
  )
}

/* ------------------------------------------------------------------ */

type Tab = 'qr' | 'phone'

function ConnectModal({ open, state, onClose, onConnected }: { open: boolean; state: WhatsappStatus['state'] | undefined; onClose: () => void; onConnected: () => void }) {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>(() => (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 'phone' : 'qr'))
  const [phone, setPhone] = useState('')
  const [conn, setConn] = useState<WhatsappConnectOut | null>(null)
  const [qrStale, setQrStale] = useState(false)

  const connect = useMutation({
    mutationFn: (p?: string) => adminApi.connectWhatsapp(p),
    onSuccess: (data) => {
      setConn(data)
      setQrStale(false)
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  // Bağlandı -> kapat.
  useEffect(() => {
    if (open && state === 'open') onConnected()
  }, [open, state, onConnected])

  // QR sekmesi açılınca QR iste; modal kapanınca sıfırla.
  useEffect(() => {
    if (!open) {
      setConn(null)
      setQrStale(false)
      return
    }
    if (tab === 'qr') connect.mutate(undefined)
    else setConn(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab])

  // QR ~40 sn geçerli: 35 sn sonra yenile düğmesi.
  useEffect(() => {
    if (!conn?.qr_base64) return
    const t = window.setTimeout(() => setQrStale(true), QR_REFRESH_MS)
    return () => window.clearTimeout(t)
  }, [conn])

  const code = conn?.pairing_code

  async function copyCode() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code.replace(/[^A-Za-z0-9]/g, ''))
      toast.success('Kod kopyalandı')
    } catch {
      toast.error('Kopyalanamadı, kodu elle yazın.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="WhatsApp'ı bağla" description="İşletmenizin WhatsApp hesabını bu panele bağlayın." size="md">
      <Tabs
        label="Bağlanma yöntemi"
        items={[
          { value: 'qr', label: 'QR kod' },
          { value: 'phone', label: 'Telefon numarasıyla' },
        ]}
        value={tab}
        onChange={setTab}
        className="mb-4"
      />

      {tab === 'qr' ? (
        <div className="flex flex-col items-center gap-4 pb-2">
          <p className="w-full text-sm text-muted">Paneli bilgisayardan kullanıyorsanız telefonunuzdaki WhatsApp ile bu kodu okutun.</p>
          <div className="flex size-56 items-center justify-center rounded-sm bg-white p-2">
            {connect.isPending && !conn?.qr_base64 ? (
              <Skeleton className="size-full" />
            ) : conn?.qr_base64 ? (
              <img src={conn.qr_base64} alt="WhatsApp bağlantı QR kodu" className={qrStale ? 'size-full opacity-30' : 'size-full'} />
            ) : (
              <p className="px-3 text-center text-sm text-neutral-600">QR kod alınamadı.</p>
            )}
          </div>
          {(qrStale || (!connect.isPending && !conn?.qr_base64)) && (
            <Button variant="secondary" leftIcon={<RefreshCw className="size-4" />} onClick={() => connect.mutate(undefined)} loading={connect.isPending}>
              QR'ı yenile
            </Button>
          )}
          <Steps />
        </div>
      ) : (
        <div className="flex flex-col gap-4 pb-2">
          <p className="text-sm text-muted">Paneli WhatsApp'ın olduğu telefondan kullanıyorsanız numaranızı yazın, size bir eşleştirme kodu verelim.</p>
          <Field label="WhatsApp numaranız">
            <PhoneInput value={phone} onValueChange={setPhone} autoComplete="tel" />
          </Field>
          <Button onClick={() => connect.mutate(normalizePhone(phone))} loading={connect.isPending} disabled={!isValidPhone(phone)}>
            {code ? 'Yeni kod al' : 'Eşleştirme kodu al'}
          </Button>
          {code && (
            <div className="flex flex-col items-center gap-3 rounded-sm border border-line-strong bg-panel px-4 py-5">
              <p className="select-all font-mono text-3xl font-semibold tracking-widest text-cream">{formatPairing(code)}</p>
              <Button variant="secondary" size="sm" leftIcon={<Copy className="size-4" />} onClick={() => void copyCode()}>
                Kodu kopyala
              </Button>
            </div>
          )}
          <Steps pairing />
        </div>
      )}
    </Modal>
  )
}

function Steps({ pairing }: { pairing?: boolean }) {
  const steps = pairing
    ? [
        'WhatsApp > Ayarlar > Bağlı cihazlar yolunu açın.',
        '"Cihaz bağla" düğmesine, sonra "Bunun yerine telefon numarasıyla bağla" seçeneğine dokunun.',
        'Yukarıdaki kodu girin.',
      ]
    : ['Telefonunuzda WhatsApp > Ayarlar > Bağlı cihazlar yolunu açın.', '"Cihaz bağla" düğmesine dokunun.', "Ekrandaki QR'ı okutun."]
  return (
    <ol className="w-full list-decimal space-y-1 pl-5 text-sm text-muted-strong">
      {steps.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ol>
  )
}
