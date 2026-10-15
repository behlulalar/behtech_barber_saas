// Panel ana sayfasında: müşterinin randevu alabilmesi için eksik kurulum adımları (yalnızca yönetici).
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardHeader } from '../../components/ui/Card'
import { adminApi } from '../../lib/api'
import { cn } from '../../lib/cn'

// Adım sırası kurulum sırasıdır: hizmet -> ekip -> saat -> hizmet ataması -> adres.
const STEPS: { key: string; title: string; hint: string; to: string }[] = [
  { key: 'services', title: 'Hizmetlerinizi ekleyin', hint: 'Saç kesimi, sakal gibi hizmetler; süre 30 dakikanın katı olmalı.', to: '/panel/hizmetler' },
  { key: 'staff', title: 'Berberlerinizi ekleyin', hint: 'Randevu verecek kişiler. Siz de kendinizi berber olarak ekleyebilirsiniz.', to: '/panel/ekip' },
  { key: 'working_hours', title: 'Çalışma saatlerini girin', hint: 'Her berberin hangi gün hangi saatlerde çalıştığı.', to: '/panel/calisma-saatleri' },
  { key: 'staff_services', title: 'Berberlere hizmet atayın', hint: 'Hangi berber hangi hizmeti veriyor? Atama yoksa müşteri o berberi göremez.', to: '/panel/ekip' },
  { key: 'address', title: 'İşletme adresinizi yazın', hint: 'Müşteri sitenizde görünür. Logo ve iletişim bilgilerini de buradan ekleyebilirsiniz.', to: '/panel/ayarlar' },
]

export function SetupGuide() {
  const setup = useQuery({ queryKey: ['admin', 'setup'], queryFn: adminApi.getSetup })
  if (!setup.data) return null

  const done = new Map(setup.data.checks.map((c) => [c.key, c.ok]))
  const steps = STEPS.map((s) => ({ ...s, ok: done.get(s.key) === true }))
  const remaining = steps.filter((s) => !s.ok).length
  if (remaining === 0) return null
  const nextKey = steps.find((s) => !s.ok)?.key

  return (
    <Card className="mb-8">
      <CardHeader
        title="Kurulumu tamamlayın"
        description={
          setup.data.ready
            ? 'Müşterileriniz randevu alabilir. Son eksikleri tamamlayın.'
            : `${steps.length - remaining}/${steps.length} adım tamam. Müşteriler randevu alabilmek için bu adımların bitmesini bekliyor.`
        }
      />
      <ol className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <li key={s.key}>
            <Link
              to={s.to}
              className={cn(
                'flex min-h-14 items-center gap-3 rounded-sm border px-3.5 py-2.5 transition-colors hover:border-copper',
                s.ok ? 'border-line/60 opacity-60' : s.key === nextKey ? 'border-copper/60 bg-copper/5' : 'border-line',
              )}
            >
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                  s.ok ? 'border-success/60 bg-success/10 text-success' : 'border-line-strong text-muted-strong',
                )}
                aria-hidden="true"
              >
                {s.ok ? <Check className="size-4" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block text-sm font-medium text-cream', s.ok && 'line-through')}>{s.title}</span>
                {!s.ok && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{s.hint}</span>}
              </span>
              {!s.ok && <ArrowRight className="size-4 shrink-0 text-copper-bright" aria-hidden="true" />}
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  )
}
