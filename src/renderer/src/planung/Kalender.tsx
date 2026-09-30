// Herkunft: MoinStudio src/renderer/src/components/PlanungKalender.tsx (MIT), für beliebig viele Konten und übersetzbar.
import { useState } from 'react'
import { luecken, monatsRaster, plusTage, rhythmusAus, tagVon, teileTermin, terminAufTag, WOCHE, wochenTage, wochentagKurz, type Luecke } from '@shared/kalender'
import type { PlanungAenderung, PlanungKarte } from '@shared/planung'
import type { Konto } from '@shared/profil'
import { RhythmusEditor } from '../profil/Bausteine'
import { useProfil } from '../profil/useProfil'
import { useI18n } from '../i18n'
import { WochenPlaner } from './Ki'

/** Farbe je Konto (Reihenfolge im Profil) – für Kalender, Legende und Pillen */
const FARBEN = ['#ffc23d', '#7aa2ff', '#5fd38d', '#ff7ab6', '#b48cff', '#ff9a5c', '#4fd1d9', '#e0e070']
export const kontoFarbe = (konten: Konto[], id: string): React.CSSProperties => ({ ['--kanal' as string]: FARBEN[Math.max(0, konten.findIndex((k) => k.id === id)) % FARBEN.length] })

/** Kalender der Upload-Termine aller Konten mit Upload-Rhythmus und Lücken (ROADMAP 6.1). */
export function PlanungKalender({ karten, oeffne, aendern }: { karten: PlanungKarte[]; oeffne: (id: string) => void; aendern: (id: string, a: PlanungAenderung) => void }): React.JSX.Element {
  const { t, locale } = useI18n()
  const { profil, aendere } = useProfil()
  const konten = profil?.konten ?? []
  const heute = tagVon(new Date())
  const [ansicht, setAnsicht] = useState<'monat' | 'woche'>('monat')
  const [bezug, setBezug] = useState(heute)
  const [versteckt, setVersteckt] = useState<Set<string>>(new Set())
  const [ziel, setZiel] = useState<string | null>(null)
  const [ziehe, setZiehe] = useState<string | null>(null)

  const name = (id: string): string => konten.find((k) => k.id === id)?.name.trim() || t('konten.unbenannt')
  const tagText = (tag: string): string => new Intl.DateTimeFormat(locale, { weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(`${tag}T12:00`))
  const b = new Date(`${bezug}T12:00`)
  const tage = ansicht === 'monat' ? monatsRaster(b.getFullYear(), b.getMonth()) : wochenTage(bezug)
  const blaettern = (richtung: number): void => {
    if (ansicht === 'woche') return setBezug(plusTage(bezug, 7 * richtung))
    setBezug(tagVon(new Date(b.getFullYear(), b.getMonth() + richtung, 1)))
  }
  const titel = ansicht === 'monat' ? new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(b) : `${tagText(tage[0]!)} – ${tagText(tage[6]!)}`

  const gezeigt = karten.filter((k) => !versteckt.has(k.kontoId))
  const mitTermin = gezeigt.filter((k) => k.termin)
  const ohneTermin = gezeigt.filter((k) => !k.termin && k.spalte !== 'veroeffentlicht')
  const rhythmus = rhythmusAus(Object.fromEntries(konten.filter((k) => !versteckt.has(k.id)).map((k) => [k.id, k.rhythmus])))
  const belegt = karten.map((k) => ({ kanal: k.kontoId, termin: k.termin }))
  const lueckenHier = luecken(rhythmus, belegt, tage[0]!, tage[tage.length - 1]!, heute)
  const lueckenBald = luecken(rhythmus, belegt, heute, plusTage(heute, 27), heute)

  const ablegen = (tag: string, id: string): void => {
    const k = karten.find((x) => x.id === id)
    if (!k) return
    const termin = terminAufTag(tag, k.termin, rhythmusAus({ x: konten.find((x) => x.id === k.kontoId)?.rhythmus ?? [] })['x'])
    if (termin !== k.termin) aendern(id, { termin })
  }
  const ziehbar = (k: PlanungKarte): React.HTMLAttributes<HTMLElement> & { draggable: boolean } => ({
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.setData('text/plain', k.id)
      e.dataTransfer.effectAllowed = 'move'
      setZiehe(k.id)
    },
    onDragEnd: () => {
      setZiehe(null)
      setZiel(null)
    }
  })

  return (
    <div className="kalender-flaeche">
      <div className="kalender">
        <div className="kalender-leiste">
          <div className="row" style={{ marginTop: 0 }}>
            <button className="icon-btn" aria-label={t('planung.kal.zurueck')} onClick={() => blaettern(-1)}>
              ‹
            </button>
            <button className="btn small" onClick={() => setBezug(heute)}>
              {t('planung.kal.heute')}
            </button>
            <button className="icon-btn" aria-label={t('planung.kal.weiter')} onClick={() => blaettern(1)}>
              ›
            </button>
            <h2 className="kalender-titel">{titel}</h2>
          </div>
          <div className="row wrap" style={{ marginTop: 0 }}>
            {konten.map((k) => (
              <button
                key={k.id}
                className={`chip legende${versteckt.has(k.id) ? '' : ' on'}`}
                style={kontoFarbe(konten, k.id)}
                onClick={() => setVersteckt((v) => (v.has(k.id) ? new Set([...v].filter((x) => x !== k.id)) : new Set([...v, k.id])))}
              >
                <span className="punkt-farbe" />
                {name(k.id)}
              </button>
            ))}
            <span className="segment">
              <button className={ansicht === 'monat' ? 'on' : ''} onClick={() => setAnsicht('monat')}>
                {t('planung.kal.monat')}
              </button>
              <button className={ansicht === 'woche' ? 'on' : ''} onClick={() => setAnsicht('woche')}>
                {t('planung.kal.woche')}
              </button>
            </span>
          </div>
        </div>

        <div className={`kalender-raster ${ansicht}`}>
          {WOCHE.map((tag) => (
            <div key={tag} className="kalender-kopf">
              {wochentagKurz(tag, locale)}
            </div>
          ))}
          {tage.map((tag) => {
            const termine = mitTermin.filter((k) => k.termin!.startsWith(tag)).sort((x, y) => x.termin!.localeCompare(y.termin!))
            const frei = lueckenHier.filter((l) => l.tag === tag)
            const fremd = ansicht === 'monat' && Number(tag.slice(5, 7)) !== b.getMonth() + 1
            return (
              <div
                key={tag}
                data-tag={tag}
                className={`kalender-tag${fremd ? ' fremd' : ''}${tag === heute ? ' heute' : ''}${tag < heute ? ' vorbei' : ''}${ziel === tag ? ' ziel' : ''}`}
                onDragOver={(e) => {
                  if (!ziehe) return
                  e.preventDefault()
                  if (ziel !== tag) setZiel(tag)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (ziehe) ablegen(tag, ziehe)
                  setZiehe(null)
                  setZiel(null)
                }}
              >
                <span className="kalender-nr">{ansicht === 'woche' ? tagText(tag) : Number(tag.slice(8))}</span>
                {termine.map((k) => (
                  <button
                    key={k.id}
                    className={`termin-pille${k.spalte === 'veroeffentlicht' ? ' fertig' : ''}${k.spalte !== 'veroeffentlicht' && k.termin! < `${heute}T` ? ' spaet' : ''}`}
                    style={kontoFarbe(konten, k.kontoId)}
                    title={`${name(k.kontoId)}: ${k.titel}`}
                    onClick={() => oeffne(k.id)}
                    {...ziehbar(k)}
                  >
                    <span className="pille-text">
                      <span className="zeit">{teileTermin(k.termin!).zeit}</span> {k.titel}
                    </span>
                  </button>
                ))}
                {frei.map((l) => (
                  <span key={l.kanal} className="luecke" style={kontoFarbe(konten, l.kanal)} title={t('planung.kal.lueckeHinweis', { konto: name(l.kanal) })}>
                    {t('planung.kal.frei', { zeit: l.zeit, konto: name(l.kanal) })}
                  </span>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      <aside className="kalender-seite">
        <section>
          <h3>{t('planung.kal.ohneTermin')}</h3>
          <p className="muted small">{t('planung.kal.ohneTerminHinweis')}</p>
          <div className="ohne-termin">
            {ohneTermin.length === 0 && <p className="muted small">{t('planung.kal.allesEingeplant')}</p>}
            {ohneTermin.map((k) => (
              <button key={k.id} className="termin-pille" style={kontoFarbe(konten, k.kontoId)} onClick={() => oeffne(k.id)} {...ziehbar(k)}>
                <span className="pille-text">{k.titel}</span>
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3>{t('planung.kal.vierWochen')}</h3>
          <LueckenText luecken={lueckenBald} rhythmusLeer={Object.values(rhythmus).every((s) => s.length === 0)} name={name} tagText={tagText} />
        </section>
        <WochenPlaner karten={karten} termin={(id, termin) => aendern(id, { termin })} />
        <section>
          <h3>{t('konten.rhythmus')}</h3>
          <p className="muted small">{t('planung.kal.rhythmusHinweis')}</p>
          {konten.map((k) => (
            <div key={k.id} className="rhythmus-konto" style={kontoFarbe(konten, k.id)}>
              <span className="rhythmus-kanal">
                <span className="punkt-farbe" />
                {name(k.id)}
              </span>
              <RhythmusEditor slots={k.rhythmus} setze={(fn) => aendere((p) => ({ ...p, konten: p.konten.map((x) => (x.id === k.id ? { ...x, rhythmus: fn(x.rhythmus) } : x)) }))} />
            </div>
          ))}
        </section>
      </aside>
    </div>
  )
}

function LueckenText({ luecken, rhythmusLeer, name, tagText }: { luecken: Luecke[]; rhythmusLeer: boolean; name: (id: string) => string; tagText: (tag: string) => string }): React.JSX.Element {
  const { t } = useI18n()
  if (rhythmusLeer) return <p className="muted small">{t('planung.kal.keinRhythmus')}</p>
  if (luecken.length === 0) return <p className="small ok-text">{t('planung.kal.allesBelegt')}</p>
  const erste = luecken[0]!
  return (
    <p className="small">
      <strong className="warn-text">{t('planung.kal.freieTermine', { anzahl: luecken.length })}</strong>
      <span className="muted"> · {t('planung.kal.naechste', { konto: name(erste.kanal), tag: tagText(erste.tag), zeit: erste.zeit })}</span>
    </p>
  )
}
