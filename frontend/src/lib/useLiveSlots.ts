import { useEffect } from 'react'
import { useToast } from '../components/ui/Toast'
import type { SlotsResponse } from '../types/api'

/** Saat ekranı açıkken saatler 15 sn'de bir ve sekmeye dönünce yenilenir (başkası aynı saati alırsa "Dolu" olarak görünür). */
export const LIVE_SLOTS_QUERY = { refetchInterval: 15_000, refetchOnWindowFocus: true } as const

/** Yenilenen listede seçili saat artık seçilebilir değilse seçimi kaldırır ve kullanıcıyı uyarır. */
export function useDropStaleSelection(data: SlotsResponse | undefined, time: string | null, clear: () => void) {
  const toast = useToast()
  useEffect(() => {
    if (!data || !time) return
    const hhmm = time.slice(0, 5)
    const slot = data.slots.find((s) => s.start === hhmm)
    if (!slot || !slot.bookable) {
      clear()
      toast.warning('Seçtiğiniz saat az önce doldu. Lütfen başka bir saat seçin.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])
}
