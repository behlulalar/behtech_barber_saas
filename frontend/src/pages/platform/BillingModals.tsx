// Ödeme al / Yenile (dönem ekle) / Dönemi düzenle modalları — Ödemeler ve işletme detay sayfalarında ortak.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import { Switch } from '../../components/ui/Switch'
import { Textarea } from '../../components/ui/Textarea'
import { useToast } from '../../components/ui/Toast'
import { errorMessage, platformApi } from '../../lib/api'
import { formatPrice, todayLocalISO } from '../../lib/format'
import type { Subscription } from '../../types/api'
import { discountedPrice, parseAmount, parsePercent, periodLabel } from './billing'

export interface TenantRef {
  id: number
  name: string
}

function ServerError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
      {message}
    </p>
  )
}

export function useSubscriptions(tenantId: number | undefined) {
  return useQuery({
    queryKey: ['platform', 'subscriptions', tenantId],
    queryFn: () => platformApi.listSubscriptions(tenantId!),
    enabled: tenantId !== undefined,
  })
}

/** Varsayılan dönem: bakiyesi olan, başlamış en yeni dönem; yoksa bakiyesi olan en yeni; yoksa boş. */
function defaultPeriod(subs: Subscription[], preferId?: number | null): Subscription | undefined {
  if (preferId) {
    const p = subs.find((s) => s.id === preferId)
    if (p) return p
  }
  const today = todayLocalISO()
  const owing = subs.filter((s) => s.balance > 0)
  return owing.find((s) => s.start_date <= today) ?? owing[0]
}

/** "İndirim (%)" alanı + canlı ödenecek tutar özeti. */
function DiscountField({ value, onChange, list, error }: { value: string; onChange: (v: string) => void; list: number | null; error?: string | null }) {
  const pct = parsePercent(value)
  const hint =
    list !== null && pct !== null && pct > 0
      ? `Liste ${formatPrice(list)} → %${pct} indirimle ${formatPrice(discountedPrice(list, pct))}`
      : 'Boşsa indirim yok. 0-100 arası.'
  return (
    <Field label="İndirim (%)" hint={hint} error={error}>
      <Input inputMode="numeric" autoComplete="off" maxLength={3} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

/* ------------------------------ Ödeme al ------------------------------ */

export function PaymentModal({
  tenant,
  subscriptionId,
  onClose,
}: {
  tenant: TenantRef | null
  subscriptionId?: number | null
  onClose: () => void
}) {
  return tenant ? <PaymentModalBody key={tenant.id} tenant={tenant} subscriptionId={subscriptionId} onClose={onClose} /> : null
}

function PaymentModalBody({ tenant, subscriptionId, onClose }: { tenant: TenantRef; subscriptionId?: number | null; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const subsQ = useSubscriptions(tenant.id)
  const subs = subsQ.data
  const [subId, setSubId] = useState<string | null>(null)
  const [amount, setAmount] = useState<string | null>(null)
  const [paidOn, setPaidOn] = useState(todayLocalISO())
  const [method, setMethod] = useState('IBAN')
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const selectedId = subId ?? (subs ? String(defaultPeriod(subs, subscriptionId)?.id ?? '') : '')
  const selected = subs?.find((s) => String(s.id) === selectedId)
  const amountText = amount ?? (selected && selected.balance > 0 ? String(selected.balance) : '')
  const parsed = parseAmount(amountText)
  const amountError = touched && (!parsed || parsed <= 0) ? 'Geçerli bir tutar girin.' : null
  const dateError = touched && !paidOn ? 'Tarih gerekli.' : null

  const mutation = useMutation({
    mutationFn: platformApi.createPayment,
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['platform'] })
      toast.success(`${formatPrice(p.amount)} ödeme kaydedildi`)
      onClose()
    },
    onError: (err) => setServerError(errorMessage(err)),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    setServerError(null)
    if (!parsed || parsed <= 0 || !paidOn) return
    mutation.mutate({
      tenant_id: tenant.id,
      subscription_id: selectedId ? Number(selectedId) : null,
      amount: parsed,
      paid_on: paidOn,
      method: method.trim() || 'IBAN',
      note: note.trim() || null,
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!mutation.isPending}
      size="sm"
      title="Ödeme al"
      description={tenant.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Vazgeç
          </Button>
          <Button type="submit" form="payment-form" loading={mutation.isPending}>
            Ödemeyi kaydet
          </Button>
        </>
      }
    >
      <form id="payment-form" onSubmit={submit} noValidate className="flex flex-col gap-4 pb-2">
        <Field label="Dönem" hint={selected ? `Dönem tutarı ${formatPrice(selected.price)} · kalan ${formatPrice(Math.max(selected.balance, 0))}` : undefined}>
          <Select
            value={selectedId}
            disabled={subsQ.isLoading}
            onChange={(e) => {
              setSubId(e.target.value)
              setAmount(null)
            }}
          >
            <option value="">Döneme bağlama</option>
            {(subs ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {periodLabel(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tutar (₺)" required error={amountError}>
          <Input data-autofocus inputMode="numeric" autoComplete="off" value={amountText} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Ödeme tarihi" required error={dateError}>
            <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
          <Field label="Yöntem">
            <Input value={method} maxLength={50} onChange={(e) => setMethod(e.target.value)} />
          </Field>
        </div>
        <Field label="Not">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <ServerError message={serverError} />
      </form>
    </Modal>
  )
}

/* ------------------------------ Yenile / dönem ekle ------------------------------ */

const CUSTOM = 'custom'

export function RenewModal({ tenant, onClose }: { tenant: TenantRef | null; onClose: () => void }) {
  return tenant ? <RenewModalBody key={tenant.id} tenant={tenant} onClose={onClose} /> : null
}

function RenewModalBody({ tenant, onClose }: { tenant: TenantRef; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const plansQ = useQuery({ queryKey: ['platform', 'plans'], queryFn: platformApi.listPlans })
  const activePlans = (plansQ.data ?? []).filter((p) => p.is_active)

  const [planKey, setPlanKey] = useState<string>('')
  const [label, setLabel] = useState('')
  const [start, setStart] = useState(todayLocalISO())
  const [end, setEnd] = useState('')
  const [price, setPrice] = useState('')
  const [discount, setDiscount] = useState('')
  const [note, setNote] = useState('')
  const [withPayment, setWithPayment] = useState(false)
  const [payAmount, setPayAmount] = useState<string | null>(null)
  const [payDate, setPayDate] = useState(todayLocalISO())
  const [payMethod, setPayMethod] = useState('IBAN')
  const [suggesting, setSuggesting] = useState(false)
  const [touched, setTouched] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  async function pickPlan(key: string) {
    setPlanKey(key)
    setPayAmount(null)
    if (key === CUSTOM || !key) return
    setSuggesting(true)
    try {
      const s = await qc.fetchQuery({
        queryKey: ['platform', 'suggest', tenant.id, key],
        queryFn: () => platformApi.suggestSubscription(tenant.id, Number(key)),
        staleTime: 0,
      })
      setStart(s.start_date)
      setEnd(s.end_date)
      setPrice(String(s.price))
    } catch (err) {
      setServerError(errorMessage(err))
    } finally {
      setSuggesting(false)
    }
  }

  // Paketler yüklenince ilk aktif paketi seç ve tarihleri öner.
  const firstPlanId = activePlans[0]?.id
  useEffect(() => {
    if (!planKey && firstPlanId !== undefined) void pickPlan(String(firstPlanId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstPlanId])

  const isCustom = planKey === CUSTOM
  const priceNum = parseAmount(price)
  const discountNum = parsePercent(discount)
  const payable = priceNum !== null && discountNum !== null ? discountedPrice(priceNum, discountNum) : priceNum
  const payText = payAmount ?? (payable !== null ? String(payable) : price)
  const payNum = parseAmount(payText)

  const errors = {
    plan: !planKey ? 'Paket seçin.' : null,
    start: !start ? 'Başlangıç gerekli.' : null,
    end: !end ? 'Bitiş gerekli.' : end < start ? 'Bitiş, başlangıçtan önce olamaz.' : null,
    price: price === '' || priceNum === null ? 'Tutar girin (0 olabilir).' : null,
    discount: discountNum === null ? 'İndirim 0 ile 100 arasında olmalı.' : null,
    pay: withPayment && (!payNum || payNum <= 0) ? 'Geçerli bir tutar girin.' : null,
  }
  const hasError = Object.values(errors).some(Boolean)
  const show = (k: keyof typeof errors) => (touched ? errors[k] : null)

  const mutation = useMutation({
    mutationFn: () =>
      platformApi.createSubscription(tenant.id, {
        plan_id: isCustom ? null : Number(planKey),
        plan_name: isCustom ? label.trim() || undefined : undefined,
        start_date: start,
        end_date: end,
        price: priceNum ?? 0,
        discount_percent: discountNum ?? 0,
        note: note.trim() || null,
        initial_payment: withPayment && payNum ? { amount: payNum, paid_on: payDate, method: payMethod.trim() || 'IBAN' } : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform'] })
      toast.success(withPayment ? 'Dönem ve ödeme kaydedildi' : 'Dönem eklendi')
      onClose()
    },
    onError: (err) => setServerError(errorMessage(err)),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    setServerError(null)
    if (hasError) return
    mutation.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!mutation.isPending}
      title="Yenile / dönem ekle"
      description={tenant.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Vazgeç
          </Button>
          <Button type="submit" form="renew-form" loading={mutation.isPending} disabled={suggesting}>
            Dönemi ekle
          </Button>
        </>
      }
    >
      <form id="renew-form" onSubmit={submit} noValidate className="flex flex-col gap-4 pb-2">
        <Field label="Paket" required error={show('plan')}>
          <Select value={planKey} disabled={plansQ.isLoading} onChange={(e) => void pickPlan(e.target.value)}>
            <option value="" disabled>
              Seçin
            </option>
            {activePlans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.duration_months} ay · {formatPrice(p.price)}
              </option>
            ))}
            <option value={CUSTOM}>Özel anlaşma</option>
          </Select>
        </Field>
        {isCustom && (
          <Field label="Etiket" hint="Boş bırakılırsa “Özel anlaşma” yazılır.">
            <Input value={label} maxLength={100} onChange={(e) => setLabel(e.target.value)} />
          </Field>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Başlangıç" required error={show('start')}>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Bitiş (dahil)" required error={show('end')}>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <Field label="Liste fiyatı (₺)" required error={show('price')}>
          <Input inputMode="numeric" autoComplete="off" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <DiscountField value={discount} onChange={setDiscount} list={priceNum} error={show('discount')} />
        <Field label="Not">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <div className="rounded-md border border-panel-line p-4">
          <Switch checked={withPayment} onChange={setWithPayment} label="Ödemeyi şimdi al" description="Dönemle birlikte ödeme kaydı oluşturur." />
          {withPayment && (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Alınan tutar (₺)" required error={show('pay')}>
                <Input inputMode="numeric" autoComplete="off" value={payText} onChange={(e) => setPayAmount(e.target.value)} />
              </Field>
              <Field label="Ödeme tarihi">
                <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              </Field>
              <Field label="Yöntem" className="sm:col-span-2">
                <Input value={payMethod} maxLength={50} onChange={(e) => setPayMethod(e.target.value)} />
              </Field>
            </div>
          )}
        </div>
        <ServerError message={serverError} />
      </form>
    </Modal>
  )
}

/* ------------------------------ Dönemi düzenle ------------------------------ */

export function EditPeriodModal({ sub, onClose }: { sub: Subscription | null; onClose: () => void }) {
  return sub ? <EditPeriodBody key={sub.id} sub={sub} onClose={onClose} /> : null
}

function EditPeriodBody({ sub, onClose }: { sub: Subscription; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState(sub.plan_name)
  const [start, setStart] = useState(sub.start_date)
  const [end, setEnd] = useState(sub.end_date)
  const [price, setPrice] = useState(String(sub.list_price ?? sub.price))
  const [discount, setDiscount] = useState(sub.discount_percent ? String(sub.discount_percent) : '')
  const [note, setNote] = useState(sub.note ?? '')
  const [serverError, setServerError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  const priceNum = parseAmount(price)
  const endError = !end ? 'Bitiş gerekli.' : end < start ? 'Bitiş, başlangıçtan önce olamaz.' : null
  const priceError = priceNum === null ? 'Tutar girin.' : null
  const nameError = !name.trim() ? 'Ad gerekli.' : null
  const discountNum = parsePercent(discount)
  const discountError = discountNum === null ? 'İndirim 0 ile 100 arasında olmalı.' : null

  const mutation = useMutation({
    mutationFn: () =>
      platformApi.updateSubscription(sub.id, {
        plan_name: name.trim(),
        start_date: start,
        end_date: end,
        price: priceNum ?? 0,
        discount_percent: discountNum ?? 0,
        note: note.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform'] })
      toast.success('Dönem güncellendi')
      onClose()
    },
    onError: (err) => setServerError(errorMessage(err)),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    setServerError(null)
    if (endError || priceError || nameError || discountError || !start) return
    mutation.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!mutation.isPending}
      size="sm"
      title="Dönemi düzenle"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Vazgeç
          </Button>
          <Button type="submit" form="period-form" loading={mutation.isPending}>
            Kaydet
          </Button>
        </>
      }
    >
      <form id="period-form" onSubmit={submit} noValidate className="flex flex-col gap-4 pb-2">
        <Field label="Paket adı" required error={touched ? nameError : null}>
          <Input data-autofocus value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Başlangıç" required>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Bitiş (dahil)" required error={touched ? endError : null}>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <Field label="Liste fiyatı (₺)" required error={touched ? priceError : null}>
          <Input inputMode="numeric" autoComplete="off" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <DiscountField value={discount} onChange={setDiscount} list={priceNum} error={touched ? discountError : null} />
        <Field label="Not">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <ServerError message={serverError} />
      </form>
    </Modal>
  )
}
