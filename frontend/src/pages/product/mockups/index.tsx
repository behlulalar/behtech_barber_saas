import './mockups.css'

interface MockupProps {
  className?: string
}

function cx(...p: (string | undefined)[]) {
  return p.filter(Boolean).join(' ')
}

/** Telefon çerçevesi içinde müşterinin randevu alma akışı. */
export function PhoneBookingMockup({ className }: MockupProps) {
  const days = [
    ['Pzt', '14'], ['Sal', '15'], ['Çar', '16'], ['Per', '17'], ['Cum', '18'],
  ]
  const slots: [string, string?][] = [
    ['13:00', 'x'], ['13:30'], ['14:00', 'x'], ['14:30', 'mk-cy-a on'],
    ['15:00', 'mk-cy-b'], ['15:30', 'x'], ['16:30', 'mk-cy-c'], ['17:00', 'x'],
    ['17:30'], ['18:00'], ['18:30', 'x'], ['19:00'],
  ]
  return (
    <div className={cx('mk-root mk-phone', className)} aria-hidden="true">
      <div className="mk-s">
        <div className="mk-phone-body" />
        <div className="mk-phone-screen">
          <div className="mk-island" />
          <div className="mk-status"><span>9:41</span><span>●●●</span></div>
          <div className="mk-scroll">
            <div className="mk-disp" style={{ fontSize: '6em', margin: '0.4em 0 0.1em' }}>Usta Berber</div>
            <div style={{ fontSize: '3.2em', color: 'var(--color-muted)' }}>Kadıköy, İstanbul · Online randevu</div>

            <div className="mk-label">Hizmet</div>
            <div className="mk-svc">
              <div><b>Saç + Sakal</b><span>45 dk</span></div>
              <em>650 ₺</em>
            </div>

            <div className="mk-label">Berber</div>
            <div className="mk-chips">
              {[['K', 'Kerem', true], ['B', 'Burak'], ['E', 'Emir']].map(([i, n, on]) => (
                <div key={n as string} className={cx('mk-chip', on ? 'on' : undefined)}><i>{i}</i>{n}</div>
              ))}
            </div>

            <div className="mk-label">Gün</div>
            <div className="mk-days">
              {days.map(([d, n], k) => (
                <div key={n} className={cx('mk-day', k === 0 ? 'on' : undefined)}><small>{d}</small><b>{n}</b></div>
              ))}
            </div>

            <div className="mk-label">Saat</div>
            <div className="mk-slots">
              {slots.map(([t, c]) => (
                <div key={t} className={cx('mk-slot', c)}>{t}</div>
              ))}
            </div>
          </div>
          <div className="mk-cta">
            <p>Pzt 14 Eki · Kerem · Saç + Sakal</p>
            <div>Randevuyu onayla</div>
          </div>
          <div className="mk-home" />
        </div>
      </div>
    </div>
  )
}

function Browser({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className="mk-bwin">
      <div className="mk-bbar"><i /><i /><i /><div className="mk-url mk-nowrap">{url}</div></div>
      <div className="mk-bbody">{children}</div>
    </div>
  )
}

/** Personel panelinin günlük ajandası (tarayıcı/tablet çerçevesi). */
export function PanelMockup({ className }: MockupProps) {
  const nav = ['Genel Bakış', 'Randevular', 'Müşteriler', 'Hizmetler', 'Ekip', 'Çalışma saatleri']
  const stats: [string, string, string?][] = [
    ['Bugün', '12', 'randevu'], ['Tamamlanan', '7'], ['Kalan', '3'], ['Ciro', '4.850', '₺'],
  ]
  const rows: [string, string, string, string, string, string][] = [
    ['10:00', 'Mehmet Yıldız', 'Saç kesimi', 'Kerem', 'Tamamlandı', 'done'],
    ['11:30', 'Can Demir', 'Saç + Sakal', 'Burak', 'Tamamlandı', 'done'],
    ['13:00', 'Ahmet Kaya', 'Sakal tıraşı', 'Emir', 'Gelmedi', 'no'],
    ['14:30', 'Selim Aksoy', 'Saç + Sakal', 'Kerem', 'Onaylandı', 'ok'],
    ['15:15', 'Oğuz Tan', 'Çocuk tıraşı', 'Burak', 'Onaylandı', 'ok'],
    ['16:00', 'Barış Çelik', 'Saç kesimi', 'Emir', 'Onaylandı', 'ok'],
  ]
  return (
    <div className={cx('mk-root mk-browser', className)} aria-hidden="true">
      <div className="mk-s">
        <Browser url="ustaberber.behtechlabs.com/panel">
          <aside className="mk-side">
            <div className="mk-brand"><span className="mk-mark">U</span><span className="mk-disp">Usta Berber</span></div>
            {nav.map((n, i) => <div key={n} className={cx('mk-nav mk-nowrap', i === 0 ? 'on' : undefined)}>{n}</div>)}
          </aside>
          <div className="mk-main">
            <div className="mk-h"><b className="mk-disp">Genel Bakış</b><span>Pazartesi, 14 Ekim</span></div>
            <div className="mk-stats">
              {stats.map(([l, v, u]) => (
                <div key={l} className="mk-stat"><small>{l}</small><b>{v}{u && <em>{u}</em>}</b></div>
              ))}
            </div>
            <div className="mk-agenda">
              {rows.map(([t, c, s, b, st, k]) => (
                <div key={t} className="mk-row">
                  <span className="t">{t}</span><span>{c}</span><span className="m">{s}</span>
                  <span className="m">{b}</span><span className={cx('mk-badge', k)}>{st}</span>
                </div>
              ))}
            </div>
          </div>
        </Browser>
      </div>
    </div>
  )
}

/** Dükkâna özel site: kendi adresi, logosu, kapağı ve ekibiyle (tarayıcı çerçevesi). */
export function TenantSiteMockup({ className }: MockupProps) {
  const prices: [string, string, string][] = [
    ['Saç kesimi', '30 dk', '400 ₺'], ['Sakal tıraşı', '20 dk', '250 ₺'], ['Saç + Sakal', '45 dk', '650 ₺'],
    ['Çocuk tıraşı', '25 dk', '300 ₺'], ['Cilt bakımı', '30 dk', '350 ₺'],
  ]
  const team: [string, string, string][] = [['K', 'Kerem', 'Usta'], ['B', 'Burak', 'Berber'], ['E', 'Emir', 'Berber']]
  return (
    <div className={cx('mk-root mk-browser', className)} aria-hidden="true">
      <div className="mk-s">
        <Browser url="ustaberber.behtechlabs.com">
          <div className="mk-site">
            <div className="mk-snav">
              <div className="l"><span className="mk-mark">U</span><span className="mk-disp">Usta Berber</span></div>
              <div className="r"><span>Hizmetler</span><span>Ekip</span><span>İletişim</span></div>
            </div>
            <div className="mk-hero">
              <div>
                <h3 className="mk-disp">Usta Berber</h3>
                <p>Moda Cd. No: 42, Kadıköy / İstanbul</p>
              </div>
              <div className="mk-btn">Randevu al</div>
            </div>
            <div className="mk-cols">
              <div className="mk-price">
                {prices.map(([n, d, p]) => (
                  <div key={n}><p>{n}<span>{d}</span></p><b>{p}</b></div>
                ))}
              </div>
              <div className="mk-team">
                {team.map(([i, n, r]) => (
                  <div key={n} className="mk-tile mk-stripe"><span>{i}</span><div>{n}<small>{r}</small></div></div>
                ))}
              </div>
            </div>
          </div>
        </Browser>
      </div>
    </div>
  )
}

/** Personel paneli telefonda: günün ajandası, tek dokunuşla tamamlama, alt sekme çubuğu. */
export function PhonePanelMockup({ className }: MockupProps) {
  const appts: [string, string, string, string, string, string][] = [
    ['10:00', 'Mehmet Yıldız', 'Saç kesimi', 'Kerem', 'Tamamlandı', 'done'],
    ['11:30', 'Can Demir', 'Saç + Sakal', 'Kerem', 'Tamamlandı', 'done'],
    ['14:30', 'Selim Aksoy', 'Saç + Sakal', 'Kerem', 'Onaylandı', 'ok'],
    ['15:15', 'Oğuz Tan', 'Çocuk tıraşı', 'Kerem', 'Onaylandı', 'ok'],
  ]
  return (
    <div className={cx('mk-root mk-phone', className)} aria-hidden="true">
      <div className="mk-s">
        <div className="mk-phone-body" />
        <div className="mk-phone-screen">
          <div className="mk-island" />
          <div className="mk-status"><span>9:41</span><span>●●●</span></div>
          <div className="mk-scroll">
            <div style={{ fontSize: '3em', color: 'var(--color-copper-bright)', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, marginTop: '0.6em' }}>Pazartesi, 14 Ekim</div>
            <div className="mk-disp" style={{ fontSize: '6.4em', margin: '0.15em 0 0.5em' }}>Günaydın, Kerem</div>
            <div className="mk-pp-stats">
              {[['Bugün', '6'], ['Biten', '2'], ['Ciro', '1.300 ₺']].map(([l, v]) => (
                <div key={l}><small>{l}</small><b>{v}</b></div>
              ))}
            </div>
            <div className="mk-label">Sıradakiler</div>
            <div className="mk-pp-list">
              {appts.map(([t, c, s, , st, k], i) => (
                <div key={t} className={cx('mk-pp-card', i === 3 ? 'focus' : undefined)}>
                  <div className="top">
                    <span className="t">{t}</span>
                    <span className={cx('mk-badge', k)}>{st}</span>
                  </div>
                  <div className="who">{c}</div>
                  <div className="what">{s} · 30 dk</div>
                  {i === 3 && (
                    <div className="acts"><span className="pri">Tamamla</span><span>Gelmedi</span></div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="mk-pp-tabs">
            {['Genel', 'Randevular', 'Müşteriler', 'Menü'].map((n, i) => (
              <span key={n} className={i === 0 ? 'on' : undefined}><i />{n}</span>
            ))}
          </div>
          <div className="mk-home" />
        </div>
      </div>
    </div>
  )
}
