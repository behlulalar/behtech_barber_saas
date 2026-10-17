// Tanıtım sitesi sayacı (çerezsiz, kişisel veri yok): ziyaret, "Ücretsiz dene" ve demo tıklaması. Sunucu yalnızca günlük toplamı artırır.
// "Do Not Track" açıksa hiçbir şey gönderilmez. Hata olursa sessizce yoksayılır.
type Hit = 'view' | 'trial_click' | 'demo_click'

function send(event: Hit) {
  try {
    if (navigator.doNotTrack === '1') return
    void fetch('/api/public/site-hit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event }), keepalive: true,
    }).catch(() => {})
  } catch {
    /* sayaç ana akışı asla bozmaz */
  }
}

/** Sayfa yüklenince (oturum başına bir kez) ziyareti, tıklamalarda ilgili sayacı gönderir. demoUrl: demo sitesinin adresi. */
export function startSiteStats(demoUrl: string): () => void {
  try {
    if (sessionStorage.getItem('site-view') !== '1') {
      sessionStorage.setItem('site-view', '1')
      send('view')
    }
  } catch {
    send('view') // depolama kapalıysa her yüklemede sayılır (kabul edilebilir)
  }
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element | null)?.closest?.('a')
    if (!a) return
    const href = a.getAttribute('href') ?? ''
    if (href === '/kayit') send('trial_click')
    else if (href.startsWith(demoUrl)) send('demo_click')
  }
  document.addEventListener('click', onClick)
  return () => document.removeEventListener('click', onClick)
}
