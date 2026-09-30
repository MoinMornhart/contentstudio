import { useCallback, useEffect, useState } from 'react'
import type { Schluessel } from '@shared/i18n'
import { KI_WEGE, type KiWegInfo, type KiWegStand } from '@shared/ki'
import type { Profil } from '@shared/profil'
import { useProfil } from './useProfil'
import { DesktopApps } from './DesktopApps'
import { fehlerText, useI18n } from '../i18n'

type Weg = Profil['ki']['wege'][number]

/** Ein KI-Weg: Zustand, Nutzen an/aus, Reihenfolge, Modell, Schlüssel, Test */
function WegZeile({ info, stand, weg, nr, anzahl, neuLaden }: { info: KiWegInfo; stand: KiWegStand | undefined; weg: Weg | undefined; nr: number; anzahl: number; neuLaden: () => void }): React.JSX.Element {
  const { t } = useI18n()
  const { profil, aendere } = useProfil()
  const [schluessel, setSchluessel] = useState('')
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const aktiv = weg?.aktiv === true

  /** Weg im Profil ändern; noch nicht gelistete Wege werden hinten angehängt */
  const setzeWeg = (fn: (w: Weg) => Weg): void =>
    aendere((p) => {
      const wege = p.ki.wege.some((w) => w.id === info.id) ? p.ki.wege : [...p.ki.wege, { id: info.id, aktiv: false, modell: null }]
      return { ...p, ki: { ...p.ki, keineKi: false, wege: wege.map((w) => (w.id === info.id ? fn(w) : w)) } }
    })
  const verschieben = (richtung: -1 | 1): void =>
    aendere((p) => {
      const wege = [...p.ki.wege]
      const i = wege.findIndex((w) => w.id === info.id)
      const j = i + richtung
      if (i < 0 || j < 0 || j >= wege.length) return p
      ;[wege[i], wege[j]] = [wege[j]!, wege[i]!]
      return { ...p, ki: { ...p.ki, wege } }
    })
  const speichern = (wert: string | null): void => {
    setMeldung(null)
    window.cs.kiSchluessel(info.id, wert).then(
      () => {
        setSchluessel('')
        neuLaden()
      },
      (e: unknown) => setMeldung({ ok: false, text: fehlerText(e) })
    )
  }
  const testen = (): void => {
    setLaeuft(true)
    setMeldung(null)
    window.cs
      .kiTest(info.id)
      .then((r) => setMeldung({ ok: true, text: t('kiw.testOk', { modell: r.modell ?? info.name }) }))
      .catch((e: unknown) => setMeldung({ ok: false, text: fehlerText(e) }))
      .finally(() => setLaeuft(false))
  }
  const geminiGesperrt = info.id === 'api-google' && !profil?.ki.geminiBezahlt
  return (
    <li className={`ki-weg${aktiv ? ' an' : ''}`}>
      <div className="ki-weg-kopf">
        <label className="switch">
          <input type="checkbox" checked={aktiv} onChange={(e) => setzeWeg((w) => ({ ...w, aktiv: e.target.checked }))} />
          <strong>{info.name}</strong>
        </label>
        <span className="badge">{t(`kiw.art.${info.art}` as Schluessel)}</span>
        <span className={stand?.bereit ? 'dot ok' : 'dot'} aria-hidden="true" />
        <span className="muted small">{!stand ? t('kiw.pruefe') : stand.bereit ? t('kiw.bereit') : t('kiw.nichtBereit')}</span>
        {stand?.bereit && <span className="muted small">· {stand.bilderSehen ? t('kiw.bilderJa') : t('kiw.bilderNein')}</span>}
        {weg && (
          <span className="ki-weg-pfeile">
            <button type="button" className="icon-btn" aria-label={t('kiw.hoch')} disabled={nr === 0} onClick={() => verschieben(-1)}>
              ↑
            </button>
            <button type="button" className="icon-btn" aria-label={t('kiw.runter')} disabled={nr === anzahl - 1} onClick={() => verschieben(1)}>
              ↓
            </button>
          </span>
        )}
      </div>
      {stand && !stand.bereit && stand.hinweis && <p className="muted small">{stand.hinweis}</p>}
      {info.id === 'api-google' && (
        <label className="switch">
          <input type="checkbox" checked={profil?.ki.geminiBezahlt === true} onChange={(e) => aendere((p) => ({ ...p, ki: { ...p.ki, geminiBezahlt: e.target.checked } }))} />
          <span className="small">{t('kiw.geminiBezahlt')}</span>
        </label>
      )}
      <div className="row wrap" style={{ marginTop: 6 }}>
        {stand && stand.modelle.length > 0 && (
          <select className="input schmal-auto" aria-label={t('kiw.modell')} value={weg?.modell ?? ''} onChange={(e) => setzeWeg((w) => ({ ...w, modell: e.target.value || null }))}>
            <option value="">{t('kiw.modellAuto')}</option>
            {stand.modelle.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
        {info.schluessel &&
          (stand?.hatSchluessel ? (
            <>
              <span className="muted small">{t('kiw.schluesselGespeichert')}</span>
              <button type="button" className="btn small" onClick={() => speichern(null)}>
                {t('kiw.loeschen')}
              </button>
            </>
          ) : (
            <>
              <input className="input schmal-auto" type="password" autoComplete="off" placeholder={t('kiw.schluesselPlatzhalter')} value={schluessel} onChange={(e) => setSchluessel(e.target.value)} />
              <button type="button" className="btn small" disabled={!schluessel.trim() || geminiGesperrt} onClick={() => speichern(schluessel)}>
                {t('kiw.speichern')}
              </button>
            </>
          ))}
        {stand?.bereit && (
          <button type="button" className="btn small" disabled={laeuft || geminiGesperrt} onClick={testen}>
            {laeuft ? t('kiw.pruefe') : t('kiw.testen')}
          </button>
        )}
        {!stand?.bereit && (
          <a className="btn small" href={info.link} target="_blank" rel="noreferrer">
            {t('kiw.einrichten')}
          </a>
        )}
      </div>
      {meldung && <p className={meldung.ok ? 'ok-note small' : 'warn small'}>{meldung.text}</p>}
    </li>
  )
}

/** KI-Wege im Assistenten (Schritt 8) und in den Einstellungen (ROADMAP 3.6) */
export function KiWege(): React.JSX.Element | null {
  const { t, locale } = useI18n()
  const { profil, aendere } = useProfil()
  const [staende, setStaende] = useState<KiWegStand[] | null>(null)
  const [monat, setMonat] = useState(0)
  const holen = useCallback(() => {
    void window.cs.kiWege().then(setStaende)
    void window.cs.kiMonat().then(setMonat)
  }, [])
  const laden = useCallback(() => {
    setStaende(null)
    holen()
  }, [holen])
  useEffect(holen, [holen])
  if (!profil) return null
  // Reihenfolge: zuerst die Wege im Profil (in ihrer Reihenfolge), dann die übrigen
  const geordnet = [...profil.ki.wege.map((w) => KI_WEGE.find((i) => i.id === w.id)).filter((i): i is KiWegInfo => !!i), ...KI_WEGE.filter((i) => !profil.ki.wege.some((w) => w.id === i.id))]
  const aktiv = profil.ki.wege.filter((w) => w.aktiv).length
  return (
    <div className="ki-wege">
      <p className="muted">{t('kiw.text')}</p>
      <label className="switch">
        <input type="checkbox" checked={profil.ki.keineKi} onChange={(e) => aendere((p) => ({ ...p, ki: { ...p.ki, keineKi: e.target.checked } }))} />
        <span>{t('ki.keine')}</span>
      </label>
      {!profil.ki.keineKi && (
        <>
          <ul className="ki-liste">
            {geordnet.map((info) => {
              const nr = profil.ki.wege.findIndex((w) => w.id === info.id)
              return <WegZeile key={info.id} info={info} stand={staende?.find((s) => s.id === info.id)} weg={profil.ki.wege.find((w) => w.id === info.id)} nr={nr} anzahl={profil.ki.wege.length} neuLaden={laden} />
            })}
          </ul>
          {aktiv === 0 && <p className="muted small">{t('kiw.keineWege')}</p>}
          <p className="muted small">{t('kiw.claudeAbo')}</p>
          <p className="muted small">{t('kiw.bedingungen')}</p>
          <div className="row">
            <button type="button" className="btn small" onClick={laden}>
              {t('kiw.neuPruefen')}
            </button>
            <span className="muted small">{t('kiw.monat', { betrag: monat.toLocaleString(locale, { style: 'currency', currency: 'USD' }) })}</span>
          </div>
        </>
      )}
      <DesktopApps />
    </div>
  )
}
