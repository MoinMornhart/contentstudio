// Herkunft: MoinStudio src/renderer/src/tabs/SchnittTab.tsx, Teil „Zuschauen“ (MIT, v0.54.0), übersetzbar gemacht.
import type { SchnittProjekt } from '@shared/schnitt'
import type { Schluessel } from '@shared/i18n'
import { useT } from '../i18n'

/** Schritte vom Rohvideo bis zum fertigen Video – für die Anzeige beim Zuschauen */
const SCHRITTE: { art: string[]; name: Schluessel }[] = [
  { art: ['schnitt-import'], name: 'schnitt.zuschauen.s.import' },
  { art: ['schnitt-transkript'], name: 'schnitt.zuschauen.s.transkript' },
  { art: ['schnitt-rohschnitt'], name: 'schnitt.zuschauen.s.rohschnitt' },
  { art: ['schnitt-bib-verteilen', 'schnitt-wunsch'], name: 'schnitt.zuschauen.s.effekte' },
  { art: ['schnitt-vorschau'], name: 'schnitt.zuschauen.s.vorschau' },
  { art: ['schnitt-export'], name: 'schnitt.zuschauen.s.export' }
]

/**
 * Zuschauen: an = man sieht live, wie geschnitten wird (Schritte, Fortschritt, Live-Bild beim Rendern); aus = alles läuft
 * im Hintergrund bis zum fertigen Export, dann kommt eine Benachrichtigung.
 */
export function Zuschauen({ p, neuLaden }: { p: SchnittProjekt; neuLaden: () => void }): React.JSX.Element {
  const t = useT()
  const a = p.auftrag
  const an = p.einstellungen.zuschauen
  const jetzt = a ? SCHRITTE.findIndex((s) => s.art.includes(a.art)) : -1
  const umschalten = (wert: boolean): void => void window.cs.schnittEinstellungen(p.id, { zuschauen: wert }).then(neuLaden)
  return (
    <div className={`zuschauen${an && a ? ' aktiv' : ''}`}>
      <label className="row" style={{ alignItems: 'center', marginTop: 0 }} title={t('schnitt.zuschauen.hinweis')}>
        <input type="checkbox" checked={an} onChange={(e) => umschalten(e.target.checked)} /> <strong>{t('schnitt.zuschauen.titel')}</strong>
        <span className="muted small">{t(an ? 'schnitt.zuschauen.an' : 'schnitt.zuschauen.aus')}</span>
      </label>
      {a && a.state === 'failed' && <p className="warn">{t('schnitt.zuschauen.fehler', { fehler: a.error ?? '' })}</p>}
      {a && a.state !== 'failed' && !an && <p className="muted small">{t('schnitt.zuschauen.hintergrund', { schritt: a.step || t('schnitt.zuschauen.wartet') })}</p>}
      {a && a.state !== 'failed' && an && (
        <>
          {jetzt >= 0 && (
            <ol className="zuschauen-schritte">
              {SCHRITTE.map((s, i) => (
                <li key={s.name} className={i < jetzt ? 'fertig' : i === jetzt ? 'jetzt' : ''}>
                  {i < jetzt ? '✓ ' : ''}
                  {t(s.name)}
                </li>
              ))}
            </ol>
          )}
          <p className="zuschauen-text">{a.step || t('schnitt.zuschauen.wartet')}</p>
          {a.progress !== null && <progress max={100} value={a.progress} style={{ width: '100%' }} />}
          {p.liveUrl ? <img className="schnitt-player zuschauen-live" src={p.liveUrl} alt={t('schnitt.zuschauen.live')} /> : jetzt >= 4 ? <div className="thumb-placeholder schnitt-player">{t('schnitt.zuschauen.erstesBild')}</div> : null}
        </>
      )}
    </div>
  )
}
