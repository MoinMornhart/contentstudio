import { useEffect, useState, type ReactNode } from 'react'
import type { ProfilDateiZweck } from '@shared/app'
import { WOCHE, wochentagKurz, type Wochentag } from '@shared/kalender'
import { fehlerText, useI18n, useT } from '../i18n'

/**
 * Setzer, der eine Änderung auf den jeweils aktuellen Wert anwendet. Wichtig bei schnellen Eingaben: Ein Setzer mit
 * fertigem Wert würde aus einem veralteten Stand rechnen und die vorige Änderung überschreiben.
 */
export type Setzer<T> = (fn: (alt: T) => T) => void

/** Eintrag ein- oder ausschalten */
export function umschalten<T>(liste: readonly T[], wert: T): T[] {
  return liste.includes(wert) ? liste.filter((x) => x !== wert) : [...liste, wert]
}

/** Beschriftetes Feld */
export function Feld({ label, children, hinweis }: { label: string; children: ReactNode; hinweis?: string }): React.JSX.Element {
  return (
    <div className="feld">
      <span>{label}</span>
      {children}
      {hinweis && <small className="muted">{hinweis}</small>}
    </div>
  )
}

/** Mehrfachauswahl als Chips; `einzeln` = höchstens einer (erneuter Klick hebt die Wahl auf) */
export function Chips<T extends string>({ werte, gewaehlt, label, setze, einzeln }: { werte: readonly T[]; gewaehlt: readonly string[]; label: (w: T) => string; setze: Setzer<string[]>; einzeln?: boolean }): React.JSX.Element {
  return (
    <div className="chips">
      {werte.map((w) => {
        const an = gewaehlt.includes(w)
        return (
          <button key={w} type="button" className={`chip${an ? ' on' : ''}`} aria-pressed={an} onClick={() => setze((alt) => (einzeln ? (alt.includes(w) ? [] : [w]) : umschalten(alt, w)))}>
            {label(w)}
          </button>
        )
      })}
    </div>
  )
}

/** Freie Einträge (z. B. eigene Richtungen, Spiele, Vorbild-Kanäle): anzeigen, hinzufügen, entfernen */
export function FreieEintraege({ werte, setze, platzhalter, ausblenden = [], umformen = (s) => s }: { werte: string[]; setze: Setzer<string[]>; platzhalter: string; ausblenden?: readonly string[]; umformen?: (s: string) => string }): React.JSX.Element {
  const t = useT()
  const [text, setText] = useState('')
  const hinzu = (): void => {
    const neu = umformen(text.trim())
    if (neu) setze((alt) => (alt.includes(neu) ? alt : [...alt, neu]))
    setText('')
  }
  const sichtbar = werte.filter((w) => !ausblenden.includes(w))
  return (
    <div className="freie-eintraege">
      {sichtbar.length > 0 && (
        <div className="chips">
          {sichtbar.map((w) => (
            <span key={w} className="chip on">
              {w}
              <button type="button" className="chip-x" aria-label={t('darst.entfernen')} onClick={() => setze((alt) => alt.filter((x) => x !== w))}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="row" style={{ marginTop: 6 }}>
        <input className="input" value={text} placeholder={platzhalter} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && hinzu()} />
        <button type="button" className="btn" disabled={!text.trim()} onClick={hinzu}>
          {t('konten.hinzufuegen')}
        </button>
      </div>
    </div>
  )
}

/** Vorschau eines Bildes aus dem Datenordner */
export function Vorschau({ datei, klein }: { datei: string; klein?: boolean }): React.JSX.Element {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let aktiv = true
    void window.cs.profilBild(datei).then((u) => aktiv && setUrl(u))
    return () => {
      aktiv = false
    }
  }, [datei])
  const name = datei.split('/').pop() ?? datei
  return url && /\.(png|jpe?g|webp|gif|svg)$/i.test(datei) ? (
    <img className={klein ? 'vorschau klein' : 'vorschau'} src={url} alt={name} title={name} />
  ) : (
    <span className="datei-name" title={datei}>
      {name}
    </span>
  )
}

/** Hochgeladene Dateien mit Vorschau, Entfernen und Hochladen-Knopf */
export function DateiListe({ dateien, zweck, besitzer, setze, knopf }: { dateien: string[]; zweck: ProfilDateiZweck; besitzer?: string; setze: Setzer<string[]>; knopf?: string }): React.JSX.Element {
  const t = useT()
  const [fehler, setFehler] = useState<string | null>(null)
  const hochladen = (): void => {
    setFehler(null)
    window.cs.profilDateien(zweck, besitzer).then(
      (neu) => {
        if (neu.length) setze((alt) => [...alt, ...neu])
      },
      (e: unknown) => setFehler(fehlerText(e))
    )
  }
  return (
    <div className="datei-liste">
      {dateien.map((d) => (
        <span key={d} className="datei">
          <Vorschau datei={d} klein />
          <button type="button" className="chip-x" aria-label={t('darst.entfernen')} onClick={() => setze((alt) => alt.filter((x) => x !== d))}>
            ✕
          </button>
        </span>
      ))}
      <button type="button" className="btn small" onClick={hochladen}>
        {knopf ?? t('darst.hochladen')}
      </button>
      {fehler && <p className="warn small">{fehler}</p>}
    </div>
  )
}

/** Eine einzelne Datei als Liste bearbeiten (Hochladen ersetzt, ✕ entfernt) */
export function einzelDatei(setze: Setzer<string | null>): Setzer<string[]> {
  return (fn) => setze((alt) => fn(alt ? [alt] : []).at(-1) ?? null)
}

export type Slot = { tag: number; zeit: string }

const sortiere = (s: Slot[]): Slot[] => [...s].sort((a, b) => ((a.tag + 6) % 7) - ((b.tag + 6) % 7))

/** Upload-Rhythmus: Wochentage an/aus, eine Uhrzeit für alle */
export function RhythmusEditor({ slots, setze }: { slots: Slot[]; setze: Setzer<Slot[]> }): React.JSX.Element {
  const { t, locale } = useI18n()
  const zeit = slots[0]?.zeit ?? '17:00'
  return (
    <div className="rhythmus">
      <div className="chips">
        {WOCHE.map((tag: Wochentag) => {
          const an = slots.some((s) => s.tag === tag)
          return (
            <button
              key={tag}
              type="button"
              className={`chip${an ? ' on' : ''}`}
              aria-pressed={an}
              onClick={() => setze((alt) => (alt.some((s) => s.tag === tag) ? alt.filter((s) => s.tag !== tag) : sortiere([...alt, { tag, zeit: alt[0]?.zeit ?? '17:00' }])))}
            >
              {wochentagKurz(tag, locale)}
            </button>
          )
        })}
      </div>
      {slots.length > 0 ? (
        <label className="inline">
          <span className="muted small">{t('konten.uhrzeit')}</span>
          <input className="input schmal" type="time" value={zeit} onChange={(e) => setze((alt) => alt.map((s) => ({ ...s, zeit: e.target.value || '17:00' })))} />
        </label>
      ) : (
        <span className="muted small">{t('konten.rhythmusLeer')}</span>
      )}
    </div>
  )
}

/** Markenfarben */
export function FarbListe({ farben, setze }: { farben: string[]; setze: Setzer<string[]> }): React.JSX.Element {
  const t = useT()
  return (
    <div className="chips">
      {farben.map((f, i) => (
        <span key={`${i}`} className="farbe">
          <input type="color" value={f} aria-label={f} onChange={(e) => setze((alt) => alt.map((x, j) => (j === i ? e.target.value : x)))} />
          <button type="button" className="chip-x" aria-label={t('darst.entfernen')} onClick={() => setze((alt) => alt.filter((_, j) => j !== i))}>
            ✕
          </button>
        </span>
      ))}
      <button type="button" className="btn small" onClick={() => setze((alt) => [...alt, '#8b6cff'])}>
        {t('marke.farbeHinzu')}
      </button>
    </div>
  )
}

/** Name einer Sprache aus ihrem Kürzel, in der Sprache der Oberfläche */
export function useSprachName(): (code: string) => string {
  const { sprache } = useI18n()
  return (code: string) => {
    try {
      return new Intl.DisplayNames([sprache], { type: 'language' }).of(code) ?? code
    } catch {
      return code
    }
  }
}
