// Herkunft: MoinStudio src/renderer/src/components/SchnittWunsch.tsx und src/shared/effekt-text.ts (MIT), übersetzbar gemacht.
import { useEffect, useState } from 'react'
import type { SchnittEffekt, SchnittProjekt } from '@shared/schnitt'
import { fehlerText, useT } from '../i18n'
import { effektText } from '@shared/effekt-text'
import { EFFEKTE_GEAENDERT } from './Zeitleiste'

type T = ReturnType<typeof useT>

export const zeitText = (sek: number): string => {
  const h = Math.floor(sek / 3600)
  const m = Math.floor((sek % 3600) / 60)
  const s = Math.floor(sek % 60)
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

function effektZeit(e: SchnittEffekt, t: T): { text: string; springen: number | null } {
  if (e.art === 'intro') return { text: t('schnitt.eff.vorDemVideo'), springen: null }
  if (typeof e.von === 'number' && typeof e.bis === 'number') return { text: `${zeitText(e.von)}–${zeitText(e.bis)}`, springen: e.von }
  if (typeof e.bei === 'number') return { text: zeitText(e.bei), springen: e.bei }
  return { text: '', springen: null }
}

/** „Was soll passieren?“ – Schnitt und Effekte in Worten (ROADMAP 5.3/5.4) */
export function WunschFeld({ p, ki, neuLaden }: { p: SchnittProjekt; ki: boolean; neuLaden: () => void }): React.JSX.Element {
  const t = useT()
  const [wunsch, setWunsch] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const beispiele = [t('schnitt.wunsch.b1'), t('schnitt.wunsch.b2'), t('schnitt.wunsch.b3'), t('schnitt.wunsch.b4'), t('schnitt.wunsch.b5')]
  const senden = (text: string): void => {
    if (!text.trim()) return
    setFehler(null)
    window.cs.schnittWunsch(p.id, text).then(
      () => {
        setWunsch('')
        neuLaden()
      },
      (e: unknown) => setFehler(fehlerText(e))
    )
  }
  const laeuft = !!p.auftrag && p.auftrag.state !== 'failed'
  const gesperrt = laeuft || !ki
  return (
    <div className="wunsch-feld">
      <h2>{t('schnitt.wunsch.titel')}</h2>
      <p className="muted small">{ki ? t('schnitt.wunsch.hinweis') : t('schnitt.fehler.ohneKi')}</p>
      <div className="row" style={{ marginTop: 6 }}>
        <input className="input" placeholder={t('schnitt.wunsch.platzhalter')} value={wunsch} disabled={gesperrt} onChange={(e) => setWunsch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && senden(wunsch)} />
        <button className="btn primary" disabled={!wunsch.trim() || gesperrt} onClick={() => senden(wunsch)}>
          {t('schnitt.wunsch.los')}
        </button>
      </div>
      {ki && (
        <div className="wunsch-beispiele">
          {beispiele.map((b) => (
            <button key={b} className="chip" disabled={laeuft} onClick={() => setWunsch(b)}>
              {b}
            </button>
          ))}
        </div>
      )}
      {laeuft && (
        <p className="muted small claude-laeuft">
          <span className="spinner" aria-hidden="true" />
          {p.auftrag?.step || t('schnitt.laeuft')}
        </p>
      )}
      {!laeuft && p.antwort && (
        <p className="wunsch-antwort">
          <span className="muted small">„{p.antwort.wunsch}“</span>
          <span>{p.antwort.text}</span>
        </p>
      )}
      {fehler && <p className="warn small">{fehler}</p>}
    </div>
  )
}

/** Effektliste unter dem fertigen Schnitt: ansehen, hinspringen, an/aus, löschen */
export function EffektListe({ p, springe, neuLaden }: { p: SchnittProjekt; springe: (s: number) => void; neuLaden: () => void }): React.JSX.Element | null {
  const t = useT()
  const [liste, setListe] = useState<SchnittEffekt[]>([])
  useEffect(() => {
    if (!p.auftrag) void window.cs.schnittEffekte(p.id).then(setListe)
  }, [p.id, p.auftrag, p.antwort?.zeit])
  // Änderungen aus der Timeline übernehmen
  useEffect(() => {
    const neu = (): void => void window.cs.schnittEffekte(p.id).then(setListe)
    window.addEventListener(EFFEKTE_GEAENDERT, neu)
    return () => window.removeEventListener(EFFEKTE_GEAENDERT, neu)
  }, [p.id])
  if (!liste.length) return null
  const aendern = (i: number, a: { aus: boolean } | null): void =>
    void window.cs.schnittEffektAendern(p.id, i, a).then((l) => {
      setListe(l)
      window.dispatchEvent(new Event(EFFEKTE_GEAENDERT))
      neuLaden()
    })
  return (
    <div className="effekt-liste">
      <div className="row" style={{ marginTop: 0, justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>{t('schnitt.effekte.titel', { anzahl: liste.filter((e) => !e.aus).length })}</strong>
        <span className="muted small">{t('schnitt.effekte.hinweis')}</span>
      </div>
      {liste
        .map((e, i) => ({ e, i, z: effektZeit(e, t) }))
        .sort((a, b) => (a.z.springen ?? -1) - (b.z.springen ?? -1))
        .map(({ e, i, z }) => (
          <div key={i} className={`effekt${e.aus ? ' aus' : ''}`}>
            <button className="satz" disabled={z.springen === null} onClick={() => z.springen !== null && springe(z.springen)}>
              <span className="muted small">{z.text}</span>
              <span>{effektText(e, t)}</span>
            </button>
            <span className="row" style={{ marginTop: 0 }}>
              <button className="btn small" onClick={() => aendern(i, { aus: !e.aus })}>
                {e.aus ? t('schnitt.effekte.an') : t('schnitt.effekte.aus')}
              </button>
              <button className="btn small" aria-label={t('schnitt.effekte.loeschen')} onClick={() => aendern(i, null)}>
                ✕
              </button>
            </span>
          </div>
        ))}
    </div>
  )
}
