// Dönüşüm hunisi: kendi kayıt olan işletmelerin yolculuğu (tüm zamanlar). Genel Bakış'ta.
import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { errorMessage, platformApi } from '../../lib/api'
import { formatNumber } from '../../lib/format'

export function FunnelCard() {
  const q = useQuery({ queryKey: ['platform', 'funnel'], queryFn: platformApi.getFunnel, staleTime: 60_000, retry: false })
  const steps = q.data?.steps ?? []
  const max = Math.max(1, steps[0]?.count ?? 1)
  return (
    <Card className="mb-6">
      <CardHeader title="Kayıttan ödemeye" description="Kendi kayıt olan işletmeler hangi adımda kalıyor (tüm zamanlar)." />
      {q.isError ? (
        <p role="alert" className="text-sm text-danger">{errorMessage(q.error)}</p>
      ) : !q.data ? (
        <Skeleton className="h-32 w-full" />
      ) : steps[0].count === 0 ? (
        <p className="text-sm text-muted-strong">Henüz kendi kayıt olan işletme yok.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {steps.map((s) => (
            <li key={s.key} className="min-w-0">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-cream">{s.label}</span>
                <span className="shrink-0 tabular-nums text-cream">
                  {formatNumber(s.count)}
                  {s.pct_of_prev !== null && <span className="ml-2 text-xs text-muted">önceki adımın %{s.pct_of_prev}&apos;i</span>}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-panel-raised" role="presentation">
                <div className="h-full rounded-full bg-copper" style={{ width: `${Math.max(2, Math.round((s.count / max) * 100))}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
