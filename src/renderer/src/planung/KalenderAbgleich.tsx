// Herkunft: MoinStudio src/renderer/src/components/KalenderAbgleich.tsx (MIT, v0.53.0), übersetzbar, Kalender „ContentStudio“.
import { useState } from 'react'
import type { KalenderLink, KalenderStand } from '@shared/planung'
import type { Schluessel, Werte } from '@shared/i18n'
import { fehlerText, useI18n } from '../i18n'

/**
 * Kalender verbinden (aus MoinStudio v0.53.0): Apple Kalender über iCloud in beide Richtungen, Google, Outlook und andere
 * per iCal-Link zum Anzeigen. Gleicht alle 5 Minuten und nach jeder Kartenänderung ab. Das Passwort geht nur einmal an
 * den Hauptprozess und kommt nie zurück.
 */

const FARBEN = ['#4285f4', '#0078d4', '#34a853', '#a142f4', '#e8710a', '#7c8a99']
const APPLE_SEITE = 'https://account.apple.com/account/manage'

/** „gerade eben“, „vor 3 min“ oder Datum mit Uhrzeit */
function seit(iso: string | null, t: (k: Schluessel, w?: Werte) => string, locale: string): string {
  if (!iso) return t('kalender.nochNie')
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return t('kalender.geradeEben')
  if (min < 60) return t('kalender.vorMin', { min })
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

export function KalenderAbgleich({ stand, neuLaden }: { stand: KalenderStand | null; neuLaden: () => void }): React.JSX.Element {
  const { t, locale } = useI18n()
  const [offen, setOffen] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laedt, setLaedt] = useState(false)
  const [appleId, setAppleId] = useState('')
  const [pw, setPw] = useState('')
  const [link, setLink] = useState({ name: '', url: '' })
  const apple = stand?.apple ?? null
  const links = stand?.links ?? []
  const anzahl = stand?.termine.length ?? 0

  const tu = (f: () => Promise<unknown>): void => {
    setFehler(null)
    setLaedt(true)
    f()
      .then(neuLaden, (e: unknown) => setFehler(fehlerText(e)))
      .finally(() => setLaedt(false))
  }
  const speichereLinks = (l: KalenderLink[]): void => tu(() => window.cs.kalenderEinstellen({ links: l }))

  const status = apple?.fehler || links.some((l) => l.fehler) ? 'warn-text' : 'ok-text'
  return (
    <section className="kalender-abgleich">
      <h3>{t('kalender.titel')}</h3>
      <p className="small">
        {!apple && !links.length ? (
          <span className="muted">{t('kalender.keiner')}</span>
        ) : (
          <span className={status}>{stand?.laeuft ? t('kalender.laeuft') : t('kalender.abgeglichen', { wann: seit(stand?.stand ?? null, t, locale), anzahl })}</span>
        )}
      </p>
      <div className="row wrap" style={{ marginTop: 0 }}>
        <button className="btn small" onClick={() => setOffen(!offen)}>
          {offen ? t('kalender.fertig') : apple || links.length ? t('kalender.verwalten') : t('kalender.verbinden')}
        </button>
        {(apple || links.length > 0) && (
          <button className="btn small" disabled={laedt || stand?.laeuft} onClick={() => tu(() => window.cs.kalenderJetzt())}>
            {t('kalender.jetzt')}
          </button>
        )}
      </div>
      {apple?.fehler && <p className="warn small">{t('kalender.quelleFehler', { name: t('kalender.apple.titel'), text: apple.fehler })}</p>}
      {links
        .filter((l) => l.fehler)
        .map((l) => (
          <p key={l.id} className="warn small">
            {t('kalender.quelleFehler', { name: l.name, text: l.fehler ?? '' })}
          </p>
        ))}
      {fehler && <p className="warn small">{fehler}</p>}

      {offen && (
        <div className="kalender-verwalten">
          <h4>{t('kalender.apple.titel')}</h4>
          {apple?.verbunden ? (
            <>
              <p className="small muted">{t('kalender.apple.verbundenAls', { benutzer: apple.benutzer })}</p>
              <label className="row small" style={{ marginTop: 0, alignItems: 'center' }}>
                <input type="checkbox" checked={apple.eintragen} onChange={(e) => tu(() => window.cs.kalenderEinstellen({ eintragen: e.target.checked }))} /> {t('kalender.apple.eintragen')}
              </label>
              <p className="small muted" style={{ margin: 0 }}>
                {t('kalender.apple.anzeigen')}
              </p>
              {apple.kalender
                .filter((k) => !k.eigen)
                .map((k) => {
                  const an = !apple.ausgeblendet.includes(k.href)
                  return (
                    <label key={k.href} className="row small" style={{ marginTop: 0, alignItems: 'center' }}>
                      <input type="checkbox" checked={an} onChange={() => tu(() => window.cs.kalenderEinstellen({ ausgeblendet: an ? [...apple.ausgeblendet, k.href] : apple.ausgeblendet.filter((x) => x !== k.href) }))} />
                      <span className="punkt-farbe" style={{ background: k.farbe }} /> {k.name}
                    </label>
                  )
                })}
              <button className="btn small" onClick={() => tu(() => window.cs.kalenderAppleTrennen())}>
                {t('kalender.apple.trennen')}
              </button>
            </>
          ) : (
            <>
              <p className="small muted">
                {apple ? t('kalender.apple.passwortFehlt', { benutzer: apple.benutzer }) : t('kalender.apple.anmelden')} {t('kalender.apple.passwortVor')}{' '}
                <a href={APPLE_SEITE} target="_blank" rel="noreferrer">
                  {'account.apple.com'}
                </a>{' '}
                {t('kalender.apple.passwortNach')}
              </p>
              <input className="input small" placeholder={t('kalender.apple.appleId')} autoComplete="username" value={appleId || apple?.benutzer || ''} onChange={(e) => setAppleId(e.target.value)} />
              <input className="input small" placeholder={t('kalender.apple.passwort')} type="password" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} />
              <button
                className="btn small primary"
                disabled={laedt || !pw.trim() || !(appleId || apple?.benutzer)}
                onClick={() =>
                  tu(async () => {
                    try {
                      await window.cs.kalenderApple(appleId || apple?.benutzer || '', pw)
                    } finally {
                      // Passwort nicht länger als nötig in der Oberfläche halten
                      setPw('')
                    }
                  })
                }
              >
                {laedt ? t('kalender.pruefe') : t('kalender.apple.verbinden')}
              </button>
            </>
          )}

          <h4>{t('kalender.links.titel')}</h4>
          <p className="small muted">{t('kalender.links.hinweis')}</p>
          {links.map((l, i) => (
            <div key={l.id} className="row small" style={{ marginTop: 0, alignItems: 'center' }}>
              <input type="checkbox" checked={l.an} onChange={(e) => speichereLinks(links.map((x) => (x.id === l.id ? { ...x, an: e.target.checked } : x)))} />
              <input type="color" value={l.farbe ?? FARBEN[i % FARBEN.length]} aria-label={t('kalender.links.farbe', { name: l.name })} onChange={(e) => speichereLinks(links.map((x) => (x.id === l.id ? { ...x, farbe: e.target.value } : x)))} />
              <span style={{ flex: 1 }}>{l.name}</span>
              <button className="chip-x" aria-label={t('kalender.links.entfernen', { name: l.name })} onClick={() => speichereLinks(links.filter((x) => x.id !== l.id))}>
                ✕
              </button>
            </div>
          ))}
          <input className="input small" placeholder={t('kalender.links.name')} value={link.name} onChange={(e) => setLink({ ...link, name: e.target.value })} />
          <input className="input small" placeholder={t('kalender.links.url')} value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} />
          <button
            className="btn small"
            disabled={laedt || !link.url.trim()}
            onClick={() =>
              tu(async () => {
                await window.cs.kalenderLinkPruefen(link.url)
                const name = link.name.trim() || (/google/i.test(link.url) ? 'Google' : /outlook|live\.com|office/i.test(link.url) ? 'Outlook' : t('kalender.standardName'))
                await window.cs.kalenderEinstellen({ links: [...links, { id: '', name, url: link.url, farbe: FARBEN[links.length % FARBEN.length], an: true }] })
                setLink({ name: '', url: '' })
              })
            }
          >
            {laedt ? t('kalender.pruefe') : t('kalender.links.hinzufuegen')}
          </button>
          <p className="small muted">{t('kalender.links.tipp')}</p>
        </div>
      )}
    </section>
  )
}
