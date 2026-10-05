// Herkunft: MoinStudio src/renderer/src/components/EffektBibliothek.tsx (MIT, v0.50.0), zweisprachig, Konten und
// Richtungen aus dem Creator-Profil statt fester Kanäle und Videotypen.
import { useEffect, useState } from 'react'
import type { BibChroma, BibEffektDaten, BibLage } from '@shared/app'
import { RICHTUNGEN } from '@shared/profil'
import type { Schluessel } from '@shared/i18n'
import { Card } from '../components/Panel'
import { fehlerText, useI18n } from '../i18n'
import { useProfil } from '../profil/useProfil'

/**
 * Effekt-Bibliothek: eigene Effekte anlegen – Abo-Animation, Boom, Meme-Einblendung … – aus Video mit Transparenz,
 * Greenscreen-Video, Bild und/oder Sound. Alles per Knopf: wie oft, für welches Konto und welche Richtung, wann und wo
 * im Bild. Greenscreen wird mit FFmpeg entfernt, Regler und Pipette mit Live-Vorschau.
 */

type Entwurf = Omit<BibEffektDaten, 'erstellt'> & { erstellt?: string }
type T = ReturnType<typeof useI18n>['t']

const STANDARD_CHROMA: BibChroma = { farbe: '#00ff00', toleranz: 0.3, weichheit: 0.1, spill: 0.5 }
const neuerEntwurf = (): Entwurf => ({ id: '', name: '', haeufigkeit: { modus: 'manuell' }, konten: [], richtungen: [], platzierung: { modus: 'ki' }, lage: 'unten-rechts', groesse: 0.35 })
const RASTER: BibLage[] = ['oben-links', 'oben', 'oben-rechts', 'links', 'mitte', 'rechts', 'unten-links', 'unten', 'unten-rechts']

function Knopf({ an, onClick, children, disabled }: { an: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }): React.JSX.Element {
  return (
    <button type="button" className={`kanal-knopf${an ? ' on' : ''}`} aria-pressed={an} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}

function kurzInfo(e: BibEffektDaten, t: T): string {
  const teile = [e.video ? t(e.video.greenscreen ? 'bib.greenscreen' : 'bib.video') : null, e.bild ? t('bib.bild') : null, e.sound ? t('bib.sound') : null].filter(Boolean)
  const wie =
    e.haeufigkeit.modus === 'immer'
      ? t('bib.immer')
      : e.haeufigkeit.modus === 'manuell'
        ? t('bib.manuell')
        : e.haeufigkeit.prozent
          ? t('bib.info.prozent', { prozent: e.haeufigkeit.prozent })
          : t('bib.info.jedes', { n: e.haeufigkeit.jedes ?? 3 })
  const wann = e.platzierung.modus === 'ki' ? t('bib.ki') : t(e.platzierung.bezug === 'ende' ? 'bib.info.vorEnde' : 'bib.info.nachStart', { s: e.platzierung.sekunden ?? 0 })
  return `${teile.join(' + ')} · ${wie} · ${wann}`
}

/** Vorschau mit Chroma-Reglern und Pipette */
function Vorschau({ e, setE }: { e: Entwurf; setE: (f: (x: Entwurf) => Entwurf) => void }): React.JSX.Element | null {
  const { t } = useI18n()
  const [bild, setBild] = useState<string | null>(null)
  const [pipette, setPipette] = useState(false)
  const [laedt, setLaedt] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [zeit, setZeit] = useState(0.5)
  const chroma = e.video?.greenscreen ? (e.chroma ?? STANDARD_CHROMA) : null
  const schluessel = JSON.stringify([e.id, e.video?.datei, e.bild?.datei, chroma, zeit, pipette])
  useEffect(() => {
    if (!e.id || (!e.video && !e.bild)) return
    // kurz warten, damit beim Ziehen eines Reglers nicht jedes Zwischenbild gerendert wird
    const uhr = setTimeout(() => {
      setLaedt(true)
      window.cs
        .schnittBibVorschau(e.id, { video: e.video?.datei, bild: e.video ? undefined : e.bild?.datei, chroma, zeit, roh: pipette })
        .then(
          (b) => {
            setBild(b)
            setFehler(null)
          },
          (err: unknown) => setFehler(fehlerText(err))
        )
        .finally(() => setLaedt(false))
    }, 250)
    return () => clearTimeout(uhr)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schluessel])
  if (!e.id || (!e.video && !e.bild)) return null
  const klick = (ev: React.MouseEvent<HTMLImageElement>): void => {
    if (!pipette || !e.video) return
    const r = ev.currentTarget.getBoundingClientRect()
    void window.cs.schnittBibPipette(e.id, e.video.datei, (ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height, zeit).then(
      (farbe) => {
        setE((a) => ({ ...a, chroma: { ...(a.chroma ?? STANDARD_CHROMA), farbe } }))
        setPipette(false)
      },
      (err: unknown) => setFehler(fehlerText(err))
    )
  }
  const regler = (k: 'toleranz' | 'weichheit' | 'spill'): React.JSX.Element => (
    <label className="bib-regler">
      <span>
        {t(`bib.chroma.${k}` as Schluessel)} <span className="muted small">{t(`bib.chroma.${k}Info` as Schluessel)}</span>
      </span>
      <input type="range" min={0} max={1} step={0.01} value={chroma![k]} onChange={(ev) => setE((a) => ({ ...a, chroma: { ...(a.chroma ?? STANDARD_CHROMA), [k]: Number(ev.target.value) } }))} />
      <span className="mono small">{Math.round(chroma![k] * 100)}</span>
    </label>
  )
  return (
    <div className="bib-vorschau">
      <div className={`bib-bild${pipette ? ' pipette' : ''}`}>
        {bild ? <img src={bild} alt={t('bib.vorschau')} onClick={klick} /> : <div className="thumb-placeholder">{t('bib.vorschauLaeuft')}</div>}
        {laedt && bild && <span className="bib-laedt">…</span>}
      </div>
      {fehler && <p className="warn small">{fehler}</p>}
      {e.video && (
        <label className="bib-regler">
          <span>{t('bib.stelle')}</span>
          <input type="range" min={0} max={1} step={0.05} value={Math.min(1, zeit / 4)} onChange={(ev) => setZeit(Number(ev.target.value) * 4)} />
          <span className="mono small">{zeit.toFixed(1)} s</span>
        </label>
      )}
      {chroma && (
        <div className="bib-chroma">
          <div className="row wrap" style={{ marginTop: 0, alignItems: 'center' }}>
            <span className="bib-farbe" style={{ background: chroma.farbe }} title={chroma.farbe} />
            <span className="mono small">{chroma.farbe}</span>
            <button type="button" className={`btn small${pipette ? ' primary' : ''}`} onClick={() => setPipette(!pipette)}>
              {t(pipette ? 'bib.pipetteAktiv' : 'bib.pipette')}
            </button>
            {pipette && <span className="muted small">{t('bib.pipetteHinweis')}</span>}
          </div>
          {regler('toleranz')}
          {regler('weichheit')}
          {regler('spill')}
        </div>
      )}
    </div>
  )
}

function Bearbeiten({ start, fertig }: { start: Entwurf; fertig: () => void }): React.JSX.Element {
  const { t } = useI18n()
  const { profil } = useProfil()
  const [e, setE] = useState<Entwurf>(start)
  const [fehler, setFehler] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [sicher, setSicher] = useState(false)
  const [laedt, setLaedt] = useState(false)
  const neu = !start.erstellt
  const konten = profil?.konten ?? []
  // Richtungen der Konten zuerst, dann die Vorschläge
  const richtungen = [...new Set([...konten.flatMap((k) => k.richtungen), ...e.richtungen])]
  const richtungName = (r: string): string => ((RICHTUNGEN as readonly string[]).includes(r) ? t(`richtung.${r}` as Schluessel) : r)

  const hochladen = async (rolle: 'video' | 'bild' | 'sound', greenscreen = false): Promise<void> => {
    setFehler(null)
    setLaedt(true)
    try {
      const r = await window.cs.schnittBibDatei(e.id || null, rolle, greenscreen)
      if (!r) return
      setE((a) => {
        const b = { ...a, id: r.id }
        if (rolle === 'video') {
          b.video = { datei: r.datei, greenscreen, ton: a.video?.ton ?? false }
          b.chroma = greenscreen ? (r.chroma ?? STANDARD_CHROMA) : undefined
        } else if (rolle === 'bild') b.bild = { datei: r.datei, dauer: a.bild?.dauer ?? 2 }
        else b.sound = { datei: r.datei, lautstaerke: a.sound?.lautstaerke ?? 1 }
        return b
      })
      if (rolle === 'video' && greenscreen) setHinweis(r.erkannt ? t('bib.farbeErkannt', { farbe: r.chroma?.farbe ?? '' }) : t('bib.farbeStandard'))
    } catch (err) {
      setFehler(fehlerText(err))
    } finally {
      setLaedt(false)
    }
  }
  const entfernen = (rolle: 'video' | 'bild' | 'sound'): void => setE((a) => ({ ...a, [rolle]: undefined, ...(rolle === 'video' ? { chroma: undefined } : {}) }))
  const speichern = (): void => {
    setFehler(null)
    // fehlende Teile ausdrücklich als null schicken, damit sie auch im gespeicherten Effekt wegfallen
    const daten = { ...e, video: e.video ?? null, bild: e.bild ?? null, sound: e.sound ?? null, chroma: e.chroma ?? null } as unknown as Partial<BibEffektDaten>
    window.cs.schnittBibSpeichern(daten).then(fertig, (err: unknown) => setFehler(fehlerText(err)))
  }
  const loeschen = (): void => {
    if (!sicher) return setSicher(true)
    void window.cs.schnittBibLoeschen(e.id).then(fertig, (err: unknown) => setFehler(fehlerText(err)))
  }
  const umschalten = (liste: string[], x: string): string[] => (liste.includes(x) ? liste.filter((y) => y !== x) : [...liste, x])
  const h = e.haeufigkeit
  const p = e.platzierung
  const datei = (an: boolean, titel: string, info: string, onClick: () => void): React.JSX.Element => (
    <Knopf an={an} disabled={laedt} onClick={onClick}>
      <strong>{titel}</strong>
      <span className="muted small">{an ? t('bib.neuWaehlen') : info}</span>
    </Knopf>
  )

  return (
    <div className="bib-edit">
      <label className="bib-zeile">
        <span className="muted small">{t('bib.name')}</span>
        <input className="input" value={e.name} placeholder={t('bib.namePlatzhalter')} maxLength={60} onChange={(ev) => setE({ ...e, name: ev.target.value })} />
      </label>

      <div className="bib-zeile">
        <span className="muted small">{t('bib.dateien')}</span>
        <div className="kanal-wahl">
          {datei(!!e.video && !e.video.greenscreen, t('bib.video'), t('bib.videoInfo'), () => void hochladen('video'))}
          {datei(!!e.video?.greenscreen, t('bib.greenscreen'), t('bib.greenscreenInfo'), () => void hochladen('video', true))}
          {datei(!!e.bild, t('bib.bild'), t('bib.bildInfo'), () => void hochladen('bild'))}
          {datei(!!e.sound, t('bib.sound'), t('bib.soundInfo'), () => void hochladen('sound'))}
        </div>
        {laedt && <span className="muted small">{t('bib.uebernimmt')}</span>}
        {hinweis && <span className="muted small">{hinweis}</span>}
        <div className="row wrap" style={{ marginTop: 0 }}>
          {e.video && (
            <>
              <label className="row" style={{ alignItems: 'center', marginTop: 0 }}>
                <input type="checkbox" checked={e.video.ton} onChange={(ev) => setE({ ...e, video: { ...e.video!, ton: ev.target.checked } })} /> {t('bib.tonMit')}
              </label>
              <button type="button" className="btn small" onClick={() => entfernen('video')}>
                {t('bib.videoWeg')}
              </button>
            </>
          )}
          {e.bild && (
            <>
              <label className="row" style={{ alignItems: 'center', marginTop: 0 }}>
                {t('bib.bildDauer')}
                <input className="input small" type="number" min={0.3} max={30} step={0.1} style={{ width: 70 }} value={e.bild.dauer} onChange={(ev) => setE({ ...e, bild: { ...e.bild!, dauer: Number(ev.target.value) } })} /> s
              </label>
              <button type="button" className="btn small" onClick={() => entfernen('bild')}>
                {t('bib.bildWeg')}
              </button>
            </>
          )}
          {e.sound && (
            <>
              <label className="row" style={{ alignItems: 'center', marginTop: 0 }}>
                {t('bib.lautstaerke')}
                <input type="range" min={0} max={2} step={0.05} value={e.sound.lautstaerke} onChange={(ev) => setE({ ...e, sound: { ...e.sound!, lautstaerke: Number(ev.target.value) } })} />
                <span className="mono small">{Math.round(e.sound.lautstaerke * 100)} %</span>
              </label>
              <button type="button" className="btn small" onClick={() => entfernen('sound')}>
                {t('bib.soundWeg')}
              </button>
            </>
          )}
        </div>
      </div>

      <Vorschau e={e} setE={setE} />

      <div className="bib-zeile">
        <span className="muted small">{t('bib.haeufigkeit')}</span>
        <div className="kanal-wahl">
          <Knopf an={h.modus === 'immer'} onClick={() => setE({ ...e, haeufigkeit: { modus: 'immer' } })}>
            {t('bib.immer')}
          </Knopf>
          <Knopf an={h.modus === 'manchmal'} onClick={() => setE({ ...e, haeufigkeit: { modus: 'manchmal', jedes: h.jedes ?? 3 } })}>
            {t('bib.manchmal')}
          </Knopf>
          <Knopf an={h.modus === 'manuell'} onClick={() => setE({ ...e, haeufigkeit: { modus: 'manuell' } })}>
            {t('bib.manuell')}
          </Knopf>
        </div>
        {h.modus === 'manchmal' && (
          <div className="row wrap" style={{ marginTop: 0, alignItems: 'center' }}>
            <Knopf an={!h.prozent} onClick={() => setE({ ...e, haeufigkeit: { modus: 'manchmal', jedes: h.jedes ?? 3 } })}>
              {t('bib.jedesNte')}
            </Knopf>
            <Knopf an={!!h.prozent} onClick={() => setE({ ...e, haeufigkeit: { modus: 'manchmal', prozent: h.prozent ?? 50 } })}>
              {t('bib.prozentDer')}
            </Knopf>
            {h.prozent ? (
              <label className="row" style={{ alignItems: 'center', marginTop: 0 }}>
                <input className="input small" type="number" min={1} max={100} style={{ width: 70 }} value={h.prozent} onChange={(ev) => setE({ ...e, haeufigkeit: { modus: 'manchmal', prozent: Number(ev.target.value) } })} /> %
              </label>
            ) : (
              <label className="row" style={{ alignItems: 'center', marginTop: 0 }}>
                {t('bib.jedes')}
                <input className="input small" type="number" min={2} max={50} style={{ width: 60 }} value={h.jedes ?? 3} onChange={(ev) => setE({ ...e, haeufigkeit: { modus: 'manchmal', jedes: Number(ev.target.value) } })} />
                {t('bib.videoN')}
              </label>
            )}
          </div>
        )}
      </div>

      {konten.length > 1 && (
        <div className="bib-zeile">
          <span className="muted small">{t('bib.konten')}</span>
          <div className="kanal-wahl">
            <Knopf an={!e.konten.length} onClick={() => setE({ ...e, konten: [] })}>
              {t('bib.alle')}
            </Knopf>
            {konten.map((k) => (
              <Knopf key={k.id} an={e.konten.includes(k.id)} onClick={() => setE({ ...e, konten: umschalten(e.konten, k.id) })}>
                {k.name.trim() || t('konten.unbenannt')}
              </Knopf>
            ))}
          </div>
        </div>
      )}
      {richtungen.length > 0 && (
        <div className="bib-zeile">
          <span className="muted small">{t('bib.richtungen')}</span>
          <div className="kanal-wahl">
            <Knopf an={!e.richtungen.length} onClick={() => setE({ ...e, richtungen: [] })}>
              {t('bib.alle')}
            </Knopf>
            {richtungen.map((r) => (
              <Knopf key={r} an={e.richtungen.includes(r)} onClick={() => setE({ ...e, richtungen: umschalten(e.richtungen, r) })}>
                {richtungName(r)}
              </Knopf>
            ))}
          </div>
        </div>
      )}

      <div className="bib-zeile">
        <span className="muted small">{t('bib.platzierung')}</span>
        <div className="kanal-wahl">
          <Knopf an={p.modus === 'fest'} onClick={() => setE({ ...e, platzierung: { modus: 'fest', bezug: p.bezug ?? 'start', sekunden: p.sekunden ?? 30 } })}>
            {t('bib.fest')}
          </Knopf>
          <Knopf an={p.modus === 'ki'} onClick={() => setE({ ...e, platzierung: { modus: 'ki' } })}>
            {t('bib.ki')}
          </Knopf>
        </div>
        {p.modus === 'fest' ? (
          <div className="row wrap" style={{ marginTop: 0, alignItems: 'center' }}>
            <input className="input small" type="number" min={0} step={1} style={{ width: 70 }} value={p.sekunden ?? 30} onChange={(ev) => setE({ ...e, platzierung: { ...p, sekunden: Number(ev.target.value) } })} /> s
            <Knopf an={p.bezug !== 'ende'} onClick={() => setE({ ...e, platzierung: { ...p, bezug: 'start' } })}>
              {t('bib.nachStart')}
            </Knopf>
            <Knopf an={p.bezug === 'ende'} onClick={() => setE({ ...e, platzierung: { ...p, bezug: 'ende' } })}>
              {t('bib.vorEnde')}
            </Knopf>
          </div>
        ) : (
          <span className="muted small">{t('bib.kiHinweis')}</span>
        )}
      </div>

      {(e.video || e.bild) && (
        <div className="bib-zeile">
          <span className="muted small">{t('bib.lage')}</span>
          <div className="row wrap" style={{ marginTop: 0, alignItems: 'center' }}>
            <div className="bib-raster" role="group" aria-label={t('bib.lageBild')}>
              {RASTER.map((l) => (
                <button key={l} type="button" className={e.lage === l ? 'on' : ''} aria-pressed={e.lage === l} title={t(`bib.lage.${l}` as Schluessel)} aria-label={t(`bib.lage.${l}` as Schluessel)} onClick={() => setE({ ...e, lage: l })} />
              ))}
            </div>
            <Knopf an={e.lage === 'voll'} onClick={() => setE({ ...e, lage: 'voll' })}>
              {t('bib.lage.voll')}
            </Knopf>
            {e.lage !== 'voll' && (
              <label className="row" style={{ alignItems: 'center', marginTop: 0 }}>
                {t('bib.groesse')}
                <input type="range" min={0.1} max={1} step={0.05} value={e.groesse} onChange={(ev) => setE({ ...e, groesse: Number(ev.target.value) })} />
                <span className="mono small">{t('bib.groesseWert', { prozent: Math.round(e.groesse * 100) })}</span>
              </label>
            )}
          </div>
        </div>
      )}

      {fehler && <p className="warn small">{fehler}</p>}
      <div className="row wrap">
        <button type="button" className="btn primary" disabled={!e.name.trim() || (!e.video && !e.bild && !e.sound)} onClick={speichern}>
          {t('bib.speichern')}
        </button>
        <button type="button" className="btn" onClick={fertig}>
          {t('bib.abbrechen')}
        </button>
        {!neu && (
          <button type="button" className="btn" onClick={loeschen}>
            {t(sicher ? 'bib.wirklichLoeschen' : 'bib.loeschen')}
          </button>
        )}
      </div>
    </div>
  )
}

export function EffektBibliothek(): React.JSX.Element {
  const { t } = useI18n()
  const [liste, setListe] = useState<BibEffektDaten[]>([])
  const [offen, setOffen] = useState<Entwurf | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const laden = (): void => void window.cs.schnittBib().then(setListe, (e: unknown) => setFehler(fehlerText(e)))
  useEffect(laden, [])
  return (
    <Card title={t('bib.titel')} badge={`${liste.length}`}>
      {fehler && <p className="warn small">{fehler}</p>}
      {offen ? (
        <Bearbeiten
          start={offen}
          fertig={() => {
            setOffen(null)
            laden()
          }}
        />
      ) : (
        <>
          <p className="muted small">{t('bib.hinweis')}</p>
          {liste.length === 0 && <p className="muted">{t('bib.leer')}</p>}
          <div className="bib-liste">
            {liste.map((x) => (
              <button key={x.id} type="button" className="schnitt-projekt" onClick={() => setOffen({ ...x })}>
                <span>
                  <strong>{x.name}</strong>
                  <span className="muted small">{kurzInfo(x, t)}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="row wrap">
            <button type="button" className="btn primary" onClick={() => setOffen(neuerEntwurf())}>
              {t('bib.neu')}
            </button>
          </div>
        </>
      )}
    </Card>
  )
}
