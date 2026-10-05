// Herkunft: MoinStudio src/renderer/src/components/SchnittZeitleiste.tsx (MIT, v0.52.0), übersetzbar gemacht.
import { useEffect, useRef, useState } from 'react'
import type { SchnittEffekt, SchnittListe, SchnittProjekt } from '@shared/schnitt'
import { effektText } from '@shared/effekt-text'
import type { Schluessel } from '@shared/i18n'
import { useT } from '../i18n'
import { zeitText } from './Wunsch'

/**
 * Timeline: alle Schnitte und Effekte auf einen Blick, über der ganzen Aufnahme. Oben der Schnitt (grün bleibt, rot fliegt
 * raus – Klick schaltet eine Schnittstelle um), darunter je eine Spur für Bibliotheks-Effekte, Bild/Text, Kamera und Ton.
 * Klick auf einen Effekt springt hin und zeigt An/Aus und Löschen.
 */

/** Ereignis, wenn Effekte geändert wurden (damit Timeline und Effektliste einander folgen) */
export const EFFEKTE_GEAENDERT = 'cs-effekte-geaendert'

const SPUREN: { schluessel: Schluessel; passt: (e: SchnittEffekt) => boolean }[] = [
  { schluessel: 'schnitt.zl.bibliothek', passt: (e) => !!e['bib'] },
  { schluessel: 'schnitt.zl.bild', passt: (e) => ['text', 'bild', 'video', 'intro'].includes(e.art) },
  { schluessel: 'schnitt.zl.kamera', passt: (e) => ['zoom', 'wackeln', 'tempo', 'einfrieren', 'farbe', 'blitz', 'uebergang', 'abblende', 'zensur'].includes(e.art) },
  { schluessel: 'schnitt.zl.ton', passt: (e) => ['geraeusch', 'lautstaerke'].includes(e.art) }
]

function spanne(e: SchnittEffekt): { a: number; b: number } | null {
  if (typeof e['von'] === 'number' && typeof e['bis'] === 'number') return { a: e['von'], b: e['bis'] }
  if (typeof e['bei'] === 'number') return { a: e['bei'], b: e['bei'] + (typeof e['dauer'] === 'number' ? e['dauer'] : 1) }
  return null
}

export function Zeitleiste({ p, liste, setListe, zeit, springe }: { p: SchnittProjekt; liste: SchnittListe; setListe: (l: SchnittListe) => void; zeit: number; springe: (s: number) => void }): React.JSX.Element {
  const t = useT()
  const [effekte, setEffekte] = useState<SchnittEffekt[]>([])
  const [gewaehlt, setGewaehlt] = useState<number | null>(null)
  const [zoom, setZoom] = useState(1)
  const rolle = useRef<HTMLDivElement>(null)
  const dauer = liste.dauer || 1
  useEffect(() => {
    if (!p.auftrag) void window.cs.schnittEffekte(p.id).then(setEffekte)
  }, [p.id, p.auftrag, p.antwort?.zeit])
  useEffect(() => {
    const neu = (): void => void window.cs.schnittEffekte(p.id).then(setEffekte)
    window.addEventListener(EFFEKTE_GEAENDERT, neu)
    return () => window.removeEventListener(EFFEKTE_GEAENDERT, neu)
  }, [p.id])
  // Abspielposition im Blick halten, wenn hineingezoomt ist
  useEffect(() => {
    const r = rolle.current
    if (!r || zoom === 1) return
    const x = (zeit / dauer) * r.scrollWidth
    if (x < r.scrollLeft || x > r.scrollLeft + r.clientWidth) r.scrollLeft = x - r.clientWidth / 3
  }, [zeit, zoom, dauer])

  const pos = (s: number): string => `${(Math.max(0, Math.min(dauer, s)) / dauer) * 100}%`
  const breite = (a: number, b: number, min = 3): string => `max(${min}px, ${((b - a) / dauer) * 100}%)`
  const aendern = (i: number, a: { aus: boolean } | null): void =>
    void window.cs.schnittEffektAendern(p.id, i, a).then((l) => {
      setEffekte(l)
      if (a === null) setGewaehlt(null)
      window.dispatchEvent(new Event(EFFEKTE_GEAENDERT))
    })
  const sel = gewaehlt !== null ? effekte[gewaehlt] : undefined
  // Zeitmarken ungefähr jede Minute (beim Hineinzoomen dichter)
  const schritte = Math.max(1, Math.min(40, Math.ceil((dauer / 60) * Math.min(zoom, 4))))
  const raster = Array.from({ length: schritte }, (_, i) => (i * dauer) / schritte)

  return (
    <div className="zeitleiste">
      <div className="row" style={{ marginTop: 0, justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>{t('schnitt.zl.titel')}</strong>
        <label className="row small muted" style={{ marginTop: 0, alignItems: 'center' }}>
          {t('schnitt.zl.zoom')}
          <input type="range" min={1} max={20} step={1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
        </label>
      </div>
      <div className="zl-rahmen">
        <div className="zl-namen">
          <span />
          <span>{t('schnitt.zl.schnitt')}</span>
          {SPUREN.map((s) => (
            <span key={s.schluessel}>{t(s.schluessel)}</span>
          ))}
        </div>
        <div className="zl-rolle" ref={rolle}>
          <div className="zl-inhalt" style={{ width: `${zoom * 100}%` }}>
            <div
              className="zl-lineal"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                springe(((e.clientX - r.left) / r.width) * dauer)
              }}
            >
              {raster.map((s, i) => (
                <span key={i} style={{ left: pos(s) }}>
                  {zeitText(s)}
                </span>
              ))}
            </div>
            <div className="zl-spur">
              {liste.behalten.map((b, i) => (
                <span key={`b${i}`} className="zl-drin" style={{ left: pos(b.start), width: breite(b.start, b.ende, 1) }} onClick={() => springe(b.start)} />
              ))}
              {liste.entfernt.map((e, i) => (
                <span
                  key={`e${i}`}
                  className={`zl-weg${e.aus ? ' aus' : ''}`}
                  style={{ left: pos(e.start), width: breite(e.start, e.ende, 1) }}
                  title={t(e.aus ? 'schnitt.zl.bleibt' : 'schnitt.zl.raus', { text: e.text ?? `${(e.ende - e.start).toFixed(1)} s` })}
                  onClick={() => void window.cs.schnittUmschalten(p.id, i).then(setListe)}
                />
              ))}
            </div>
            {SPUREN.map((s) => (
              <div key={s.schluessel} className="zl-spur">
                {effekte.map((e, i) => {
                  // jeder Effekt nur in der ersten passenden Spur
                  if (SPUREN.find((x) => x.passt(e)) !== s) return null
                  const z = spanne(e)
                  if (!z) return null
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`zl-effekt${e.aus ? ' aus' : ''}${gewaehlt === i ? ' on' : ''}`}
                      style={{ left: pos(z.a), width: breite(z.a, z.b) }}
                      title={`${zeitText(z.a)} ${effektText(e, t)}`}
                      onClick={() => {
                        setGewaehlt(i)
                        springe(z.a)
                      }}
                    />
                  )
                })}
              </div>
            ))}
            <span className="zl-kopf" style={{ left: pos(zeit) }} />
          </div>
        </div>
      </div>
      {sel ? (
        <div className="row wrap" style={{ alignItems: 'center' }}>
          <span>
            <span className="muted small">{spanne(sel) ? zeitText(spanne(sel)!.a) : t('schnitt.zl.vorDemVideo')}</span> {effektText(sel, t)}
          </span>
          <button type="button" className="btn small" onClick={() => aendern(gewaehlt!, { aus: !sel.aus })}>
            {t(sel.aus ? 'schnitt.zl.einschalten' : 'schnitt.zl.ausschalten')}
          </button>
          <button type="button" className="btn small" onClick={() => aendern(gewaehlt!, null)}>
            {t('schnitt.zl.loeschen')}
          </button>
        </div>
      ) : (
        <span className="muted small">{t('schnitt.zl.hinweis')}</span>
      )}
    </div>
  )
}
