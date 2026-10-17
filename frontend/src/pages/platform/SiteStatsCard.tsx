// Tanıtım sitesi sayaçları (çerezsiz): ziyaret, "Ücretsiz dene" / demo tıklaması, kayıt. Platform Genel Bakış'ta.
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { SegmentedControl } from '../../components/ui/Tabs'
import { Card, CardHeader } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { errorMessage, platformApi } from '../../lib/api'
import { formatNumber } from '../../lib/format'

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-panel-line bg-panel-raised px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl tabular-nums text-cream">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-strong">{sub}</p>}
    </div>
  )
}

export function SiteStatsCard() {
  const [days, setDays] = useState<7 | 30>(30)
  const q = useQuery({ queryKey: ['platform', 'site-stats', days], queryFn: () => platformApi.getSiteStats(days), staleTime: 60_000, retry: false })
  const d = q.data
  const pct = (a: number, b: number) => (b > 0 ? `%${Math.round((a / b) * 100)}` : '—')
  return (
    <Card className="mb-6">
      <CardHeader
        title="Tanıtım sitesi"
        description="Çerezsiz sayaç: kişisel veri tutulmaz, yalnızca günlük toplamlar."
        action={
          <SegmentedControl
            label="Dönem"
            value={String(days)}
            onChange={(v) => setDays(v === '7' ? 7 : 30)}
            items={[{ value: '7', label: '7 gün' }, { value: '30', label: '30 gün' }]}
          />
        }
      />
      {q.isError ? (
        <p role="alert" className="text-sm text-danger">{errorMessage(q.error)}</p>
      ) : !d ? (
        <Skeleton className="h-20 w-full" />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Ziyaret" value={formatNumber(d.view)} />
          <Stat label="“Ücretsiz dene” tıklaması" value={formatNumber(d.trial_click)} sub={`Ziyaretin ${pct(d.trial_click, d.view)}'i`} />
          <Stat label="Demo tıklaması" value={formatNumber(d.demo_click)} sub={`Ziyaretin ${pct(d.demo_click, d.view)}'i`} />
          <Stat label="Kayıt olan işletme" value={formatNumber(d.signups)} sub={`Tıklamanın ${pct(d.signups, d.trial_click)}'i`} />
        </div>
      )}
    </Card>
  )
}
