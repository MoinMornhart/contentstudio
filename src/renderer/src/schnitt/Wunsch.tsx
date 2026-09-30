// Herkunft: MoinStudio src/renderer/src/components/SchnittWunsch.tsx und src/shared/effekt-text.ts (MIT), übersetzbar gemacht.
import { useEffect, useState } from 'react'
import type { SchnittEffekt, SchnittProjekt } from '@shared/schnitt'
import type { Schluessel } from '@shared/i18n'
import { fehlerText, useT } from '../i18n'

type T = ReturnType<typeof useT>

export const zeitText = (sek: number): string => {
  const h = Math.floor(sek / 3600)
  const m = Math.floor((sek % 3600) / 60)
  const s = Math.floor(sek % 60)
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

const zahl = (x: unknown): string => (typeof x === 'number' ? String(Math.round(x * 100) / 100) : '')

/** Effekt in einfachen Worten */
export function effektText(e: SchnittEffekt, t: T): string {
  switch (e.art) {
    case 'tempo':
      return t((e['faktor'] as number) < 1 ? 'schnitt.eff.zeitlupe' : 'schnitt.eff.zeitraffer', { faktor: zahl(e['faktor']) })
    case 'einfrieren':
      return t('schnitt.eff.einfrieren', { dauer: zahl(e['dauer']) })
    case 'zoom':
      return t('schnitt.eff.zoom', { faktor: zahl(e['faktor']) })
    case 'farbe': {
      const teile = [e['schwarzweiss'] ? t('schnitt.eff.schwarzweiss') : '', typeof e['ton'] === 'string' ? e['ton'] : '', e['saettigung'] !== undefined ? `${t('schnitt.eff.saettigung')} ${zahl(e['saettigung'])}` : '', e['kontrast'] !== undefined ? `${t('schnitt.eff.kontrast')} ${zahl(e['kontrast'])}` : '']
      return t('schnitt.eff.farbe', { was: teile.filter(Boolean).join(', ') || t('schnitt.eff.angepasst') })
    }
    case 'blitz':
      return t(e['farbe'] === 'schwarz' ? 'schnitt.eff.blitzSchwarz' : 'schnitt.eff.blitz')
    case 'uebergang':
      return t(e['farbe'] === 'weiss' ? 'schnitt.eff.blendeWeiss' : 'schnitt.eff.blende')
    case 'abblende':
      return t(e['richtung'] === 'ein' ? 'schnitt.eff.einblenden' : 'schnitt.eff.ausblenden')
    case 'text':
      return t('schnitt.eff.text', { text: String(e['text'] ?? '') })
    case 'geraeusch':
      return t('schnitt.eff.geraeusch', { klang: String(e['klang'] ?? '') })
    case 'lautstaerke':
      return t('schnitt.eff.lautstaerke', { faktor: zahl(e['faktor']) })
    case 'intro': {
      const teile = (e['teile'] as { art: string; text?: string }[] | undefined) ?? []
      const karte = teile.find((x) => x.art === 'karte')
      return t(karte ? 'schnitt.eff.introKarte' : 'schnitt.eff.intro', { anzahl: teile.filter((x) => x.art === 'clip').length, text: karte?.text ?? '' })
    }
    case 'wackeln':
    case 'bild':
    case 'zensur':
      return t(`schnitt.eff.${e.art}` as Schluessel)
    default:
      return e.art
  }
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
  if (!liste.length) return null
  const aendern = (i: number, a: { aus: boolean } | null): void =>
    void window.cs.schnittEffektAendern(p.id, i, a).then((l) => {
      setListe(l)
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
