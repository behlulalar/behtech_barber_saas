import { useEffect } from 'react'

/**
 * Kaydırma konumu sayfa sonunu aşarsa (altta boş alana kayma) sona geri çeker.
 * iOS Safari'de araç çubukları küçülüp büyürken ya da içerik yüksekliği değişirken (yükleme iskeleti → gerçek içerik) sayfa,
 * kendi sonunun ötesine kaydırılmış halde kalabiliyor ve altta boş bir alan görünüyor. Burada hem düzen değişince
 * hem de kaydırma durunca (iOS'un normal "esneme" hareketi bitene kadar beklenir) konum geçerli aralığa getirilir.
 */
export function useClampScroll() {
  useEffect(() => {
    let timer: number | undefined
    const clamp = () => {
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
      if (window.scrollY > max + 2) window.scrollTo({ top: max, behavior: 'auto' })
    }
    const onScroll = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(clamp, 220) // esneme hareketi bitsin, sonra kontrol et
    }
    const ro = new ResizeObserver(clamp)
    ro.observe(document.documentElement)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', clamp)
    window.visualViewport?.addEventListener('resize', clamp)
    return () => {
      window.clearTimeout(timer)
      ro.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', clamp)
      window.visualViewport?.removeEventListener('resize', clamp)
    }
  }, [])
}
