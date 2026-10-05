// Herkunft: MoinStudio src/renderer/src/tabs/SchnittTab.tsx (MIT), verallgemeinert auf Konten, Richtungen, Formate, Spuren und Plattformen.
import { NamenVorschlaege } from '../planung/Ki'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SchnittAbschnitt, SchnittExport, SchnittHighlight, SchnittListe, SchnittProjekt, SpurArt } from '@shared/schnitt'
import { PLATTFORMEN, RICHTUNGEN } from '@shared/profil'
import type { Schluessel } from '@shared/i18n'
import { Card, PageHeader } from '../components/Panel'
import { EffektListe, WunschFeld, zeitText } from '../schnitt/Wunsch'
import { Zeitleiste } from '../schnitt/Zeitleiste'
import { Zuschauen } from '../schnitt/Zuschauen'
import { EffektBibliothek } from '../schnitt/EffektBibliothek'
import { abholen, OEFFNE_EREIGNIS } from '../navigation'
import { useProfil } from '../profil/useProfil'
import { fehlerText, useT } from '../i18n'

/**
 * Schnitt-Reiter (ROADMAP M5): Rohvideo rein, fertiges Video raus. Import mit Vorschau, Wellenform und Standbild-Leiste,
 * Transkript, Rohschnitt nach Stil der Richtung, Wünsche in Worten, Spuren, Hochformat und Export je Plattform.
 */

function groesseText(bytes: number): string {
  return bytes > 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`
}

/** Wellenform mit Abspielposition; Klick springt an die Stelle. */
function Wellenform({ id, dauer, zeit, springe }: { id: string; dauer: number; zeit: number; springe: (s: number) => void }): React.JSX.Element | null {
  const [daten, setDaten] = useState<{ aufloesung: number; werte: number[] } | null>(null)
  const leinwand = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    void window.cs.schnittWellenform(id).then(setDaten)
  }, [id])
  useEffect(() => {
    const c = leinwand.current
    if (!c || !daten) return
    const g = c.getContext('2d')
    if (!g) return
    const w = (c.width = c.clientWidth * devicePixelRatio)
    const h = (c.height = 64 * devicePixelRatio)
    g.clearRect(0, 0, w, h)
    const n = daten.werte.length
    g.fillStyle = getComputedStyle(c).getPropertyValue('--accent').trim() || '#f0a83a'
    for (let x = 0; x < w; x++) {
      const a = Math.floor((x / w) * n)
      const b = Math.max(a + 1, Math.floor(((x + 1) / w) * n))
      let spitze = 0
      for (let i = a; i < b; i++) spitze = Math.max(spitze, daten.werte[i] ?? 0)
      const hoehe = Math.max(1, (spitze / 100) * h)
      g.fillRect(x, (h - hoehe) / 2, 1, hoehe)
    }
    g.fillStyle = '#ffffff'
    g.fillRect((zeit / dauer) * w, 0, 2 * devicePixelRatio, h)
  }, [daten, zeit, dauer])
  if (!daten) return null
  return (
    <canvas
      ref={leinwand}
      className="wellenform"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        springe(((e.clientX - r.left) / r.width) * dauer)
      }}
    />
  )
}

/** Rohschnitt: vorher/nachher, was rausfliegt (Klick springt hin). */
function Rohschnitt({ id, liste, setListe, springe }: { id: string; liste: SchnittListe; setListe: (l: SchnittListe) => void; springe: (s: number) => void }): React.JSX.Element {
  const t = useT()
  const nachher = liste.behalten.reduce((s, b) => s + b.ende - b.start, 0)
  const [pausenZeigen, setPausenZeigen] = useState(false)
  const umschalten = (i: number): void => void window.cs.schnittUmschalten(id, i).then(setListe)
  const grund = (g: SchnittListe['entfernt'][number]['grund']): string => t(`schnitt.grund.${g}` as Schluessel)
  return (
    <div className="rohschnitt">
      <p>
        <strong>{t('schnitt.roh.titel')}</strong> {t('schnitt.roh.kuerzer', { vorher: zeitText(liste.dauer), nachher: zeitText(nachher), prozent: Math.round((1 - nachher / Math.max(0.001, liste.dauer)) * 100) })}
      </p>
      <div className="schnitt-streifen">
        {liste.entfernt.map((e, i) => (
          <span key={i} className={`weg ${e.grund}${e.aus ? ' aus' : ''}`} style={{ left: `${(e.start / liste.dauer) * 100}%`, width: `${((e.ende - e.start) / liste.dauer) * 100}%` }} title={`${grund(e.grund)} ${zeitText(e.start)}`} />
        ))}
      </div>
      <div className="transkript">
        {liste.entfernt.map((e, i) =>
          e.grund === 'pause' && !pausenZeigen ? null : (
            <div key={i} className={e.aus ? 'schnittstelle aus' : 'schnittstelle'}>
              <button className="satz" onClick={() => springe(Math.max(0, e.start - 1))}>
                <span className="muted small">{zeitText(e.start)}</span>
                <span>
                  <span className="badge">{grund(e.grund)}</span> {e.text ?? `${(e.ende - e.start).toFixed(1)} s`}
                </span>
              </button>
              <button className="btn small" title={e.aus ? t('schnitt.roh.wiederRaus') : t('schnitt.roh.drinlassen')} onClick={() => umschalten(i)}>
                {e.aus ? t('schnitt.roh.bleibt') : t('schnitt.roh.raus')}
              </button>
            </div>
          )
        )}
        <button className="btn small" onClick={() => setPausenZeigen((z) => !z)}>
          {pausenZeigen ? t('schnitt.roh.pausenAus') : t('schnitt.roh.pausenZeigen', { anzahl: liste.entfernt.filter((e) => e.grund === 'pause').length })}
        </button>
      </div>
    </div>
  )
}

/** Transkript: jeder Satz mit Zeit, Klick springt hin, der gerade laufende Satz ist hervorgehoben. */
function Transkript({ id, bereit, zeit, springe, liste, setListe }: { id: string; bereit: boolean; zeit: number; springe: (s: number) => void; liste: SchnittListe | null; setListe: (l: SchnittListe) => void }): React.JSX.Element | null {
  const t = useT()
  const [abschnitte, setAbschnitte] = useState<SchnittAbschnitt[] | null>(null)
  useEffect(() => {
    if (bereit) void window.cs.schnittTranskript(id).then(setAbschnitte)
  }, [id, bereit])
  if (!abschnitte) return null
  // Satz gilt als rausgeschnitten, wenn aktive Schnitte mehr als die Hälfte davon abdecken
  const raus = (a: SchnittAbschnitt): boolean =>
    !!liste && liste.entfernt.filter((e) => !e.aus).reduce((s, e) => s + Math.max(0, Math.min(e.ende, a.ende) - Math.max(e.start, a.start)), 0) > (a.ende - a.start) / 2
  return (
    <div className="transkript">
      <div className="card-head">
        <h2>{t('schnitt.transkript.titel')}</h2>
        <button className="btn small" onClick={() => void window.cs.schnittTranskriptStart(id)}>
          {t('schnitt.transkript.neu')}
        </button>
      </div>
      {abschnitte.length === 0 && <p className="muted">{t('schnitt.transkript.leer')}</p>}
      {abschnitte.map((a) => {
        const weg = raus(a)
        return (
          <div key={a.start} className={weg ? 'schnittstelle aus' : 'schnittstelle'}>
            <button className={zeit >= a.start && zeit < a.ende ? 'satz aktiv' : 'satz'} onClick={() => springe(a.start)}>
              <span className="muted small">{zeitText(a.start)}</span>
              <span>{a.text}</span>
            </button>
            {liste && (
              <button className="btn small" title={weg ? t('schnitt.transkript.zurueckHinweis') : t('schnitt.transkript.rausHinweis')} onClick={() => void window.cs.schnittBereich(id, a.start - 0.05, a.ende + 0.1, !weg, a.text).then(setListe)}>
                {weg ? t('schnitt.transkript.zurueck') : t('schnitt.roh.raus')}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Weitere Spuren (ROADMAP 5.6): Facecam, Gameplay oder getrennter Ton, per Ton ausgerichtet; Versatz von Hand korrigierbar. */
function Spuren({ p, neuLaden }: { p: SchnittProjekt; neuLaden: () => void }): React.JSX.Element {
  const t = useT()
  const [fehler, setFehler] = useState<string | null>(null)
  const hinzu = (art: SpurArt): void => void window.cs.schnittSpurHinzu(p.id, art).then(neuLaden, (e: unknown) => setFehler(fehlerText(e)))
  const aendern = (i: number, a: { versatz: number } | null): void => void window.cs.schnittSpurAendern(p.id, i, a).then(neuLaden)
  return (
    <div className="schnitt-fertig">
      <div className="card-head">
        <h2>{t('schnitt.spuren.titel')}</h2>
      </div>
      <p className="muted small">{t('schnitt.spuren.hinweis')}</p>
      {p.spuren.map((s, i) => (
        <div key={`${s.pfad}-${i}`} className="schnittstelle">
          <span className="satz" style={{ cursor: 'default' }}>
            <span className="badge">{t(`schnitt.spur.${s.art}` as Schluessel)}</span>
            <span title={s.pfad}>
              {s.pfad.split(/[\\/]/).pop()}{' '}
              <span className="muted small">
                {s.versatz === null ? t('schnitt.spuren.wirdAusgerichtet') : t('schnitt.spuren.versatz', { sek: s.versatz.toFixed(2), sicher: Math.round((s.sicherheit ?? 0) * 100) })}
              </span>
            </span>
          </span>
          <span className="row" style={{ marginTop: 0 }}>
            {s.versatz !== null && (
              <input
                className="input"
                type="number"
                step="0.02"
                style={{ width: 90 }}
                aria-label={t('schnitt.spuren.versatzHand')}
                title={t('schnitt.spuren.versatzHand')}
                defaultValue={s.versatz.toFixed(2)}
                onBlur={(e) => Number(e.target.value) !== s.versatz && aendern(i, { versatz: Number(e.target.value) })}
              />
            )}
            <button className="btn small" aria-label={t('schnitt.spuren.entfernen')} onClick={() => aendern(i, null)}>
              ✕
            </button>
          </span>
        </div>
      ))}
      <div className="row wrap">
        {(['facecam', 'gameplay', 'ton'] as const).map((a) => (
          <button key={a} className="btn small" disabled={!!p.auftrag} onClick={() => hinzu(a)}>
            + {t(`schnitt.spur.${a}` as Schluessel)}
          </button>
        ))}
      </div>
      {fehler && <p className="warn small">{fehler}</p>}
    </div>
  )
}

/** Export je Plattform: Datei, Prüfung nach den Vorgaben, Titel, Text, Kapitel, Speichern, Thumbnail-Vorschläge. */
function Export({ p, neuLaden }: { p: SchnittProjekt; neuLaden: () => void }): React.JSX.Element {
  const t = useT()
  const [info, setInfo] = useState<SchnittExport | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  useEffect(() => {
    if (p.exportiert && !p.auftrag) void window.cs.schnittExportInfo(p.id).then(setInfo)
  }, [p.id, p.exportiert, p.auftrag])
  const kopieren = (x: string): void => void navigator.clipboard.writeText(x).then(() => setMeldung(t('schnitt.export.kopiert')))
  const plattform = t(`plattform.${p.plattform}` as Schluessel)
  return (
    <div className="schnitt-fertig">
      <div className="card-head">
        <h2>{t('schnitt.export.titel', { plattform })}</h2>
        <select className="input" style={{ flex: '0 0 190px' }} value={p.plattform} aria-label={t('schnitt.export.plattform')} onChange={(e) => void window.cs.schnittEinstellungen(p.id, { plattform: e.target.value as SchnittProjekt['plattform'] }).then(neuLaden)}>
          {PLATTFORMEN.map((x) => (
            <option key={x} value={x}>
              {t(`plattform.${x}` as Schluessel)}
            </option>
          ))}
        </select>
      </div>
      <p className="muted small">{t('schnitt.export.hinweis')}</p>
      <div className="row wrap">
        <button className="btn primary" disabled={!!p.auftrag} onClick={() => void window.cs.schnittExport(p.id).then(neuLaden)}>
          {p.exportiert ? t('schnitt.export.neu') : t('schnitt.export.los')}
        </button>
        {info && (
          <>
            <button className="btn" onClick={() => void window.cs.schnittExportSpeichern(p.id).then((f) => f && setMeldung(t('schnitt.export.gespeichert', { datei: f })))}>
              {t('schnitt.export.speichern')}
            </button>
            <button className="btn" onClick={() => void window.cs.schnittThumbnail(p.id).then(() => setMeldung(t('schnitt.export.thumbLaeuft')))}>
              {t('schnitt.export.thumb')}
            </button>
          </>
        )}
      </div>
      <div className="row wrap" style={{ alignItems: 'center' }}>
        <span className="muted small">{t('schnitt.programm.label')}</span>
        {(
          [
            ['premiere', 'Premiere Pro'],
            ['aftereffects', 'After Effects'],
            ['resolve', 'DaVinci Resolve'],
            ['capcut', 'CapCut']
          ] as const
        ).map(([ziel, name]) => (
          <button
            key={ziel}
            className="btn small"
            title={t(`schnitt.programm.${ziel}`)}
            onClick={() =>
              void window.cs.schnittProgramm(p.id, ziel).then(
                (r) => r.datei && setMeldung(t(r.auftrag ? 'schnitt.programm.laeuft' : 'schnitt.programm.fertig', { datei: r.datei })),
                (e: unknown) => setMeldung(fehlerText(e))
              )
            }
          >
            {name}
          </button>
        ))}
      </div>
      {meldung && <p className="ok-note small">{meldung}</p>}
      {info && info.plattform !== p.plattform && <p className="warn small">{t('schnitt.export.alt', { plattform: t(`plattform.${info.plattform}` as Schluessel) })}</p>}
      {info && (
        <>
          {info.url.includes('.m4a') ? <audio src={info.url} controls preload="metadata" style={{ marginTop: 10, width: '100%' }} /> : <video className="schnitt-player" src={`${info.url}#t=0.1`} controls preload="metadata" style={{ marginTop: 10 }} />}
          <ul className="pruefliste">
            {info.pruefung.map((x) => (
              <li key={x.punkt} className={x.ok ? 'own-ok' : 'own-bad'}>
                {x.ok ? '✓' : '✗'} {x.punkt} <span className="muted small">({x.wert})</span>
              </li>
            ))}
          </ul>
          <dl className="facts">
            {info.titel.length > 0 && (
              <>
                <dt>{t('schnitt.export.titelVorschlag')}</dt>
                <dd>
                  {info.titel.map((x) => (
                    <button key={x} className="chip" onClick={() => kopieren(x)} title={t('schnitt.export.kopieren')}>
                      {x}
                    </button>
                  ))}
                </dd>
              </>
            )}
            <dt>{t('schnitt.export.text')}</dt>
            <dd>
              <button className="satz" onClick={() => kopieren(`${info.beschreibung}${info.kapitelText ? `\n\n${info.kapitelText}` : ''}`)} title={t('schnitt.export.kopieren')}>
                <span />
                <span style={{ whiteSpace: 'pre-wrap' }}>
                  {info.beschreibung}
                  {info.kapitelText ? `\n\n${info.kapitelText}` : ''}
                </span>
              </button>
            </dd>
          </dl>
        </>
      )}
    </div>
  )
}

/** Höhepunkte und Kurzvideos: stärkste Momente finden, als Clip (16:9) oder Kurzvideo (9:16) exportieren. */
function Highlights({ p, ki, springe, neuLaden }: { p: SchnittProjekt; ki: boolean; springe: (s: number) => void; neuLaden: () => void }): React.JSX.Element {
  const t = useT()
  const [liste, setListe] = useState<SchnittHighlight[] | null>(null)
  const [clips, setClips] = useState<{ name: string; url: string }[]>([])
  useEffect(() => {
    if (p.highlights !== null && !p.auftrag) void window.cs.schnittHighlights(p.id).then(setListe)
    if (p.clipsStand && !p.auftrag) void window.cs.schnittClipDateien(p.id).then(setClips)
  }, [p.id, p.highlights, p.clipsStand, p.auftrag])
  const exportiere = (auswahl: { index: number; art: 'clip' | 'short' }[]): void => void window.cs.schnittClips(p.id, auswahl).then(neuLaden)
  return (
    <div className="schnitt-fertig">
      <div className="card-head">
        <h2>{t('schnitt.hl.titel')}</h2>
      </div>
      <p className="muted small">{ki ? t('schnitt.hl.hinweis') : t('schnitt.hl.ohneKi')}</p>
      <div className="row wrap">
        <button className="btn" disabled={!!p.auftrag || !p.transkript} onClick={() => void window.cs.schnittHighlightsStart(p.id).then(neuLaden)}>
          {p.highlights === null ? t('schnitt.hl.finden') : t('schnitt.hl.neu')}
        </button>
        {liste && liste.length > 0 && (
          <button className="btn primary" disabled={!!p.auftrag} onClick={() => exportiere(liste.map((_, index) => ({ index, art: 'short' as const })))}>
            {t('schnitt.hl.alleKurz')}
          </button>
        )}
      </div>
      {liste && liste.length === 0 && <p className="muted">{t('schnitt.hl.keine')}</p>}
      {liste?.map((h, i) => (
        <div key={i} className="schnittstelle">
          <button className="satz" onClick={() => springe(h.start)}>
            <span className="muted small">{zeitText(h.start)}</span>
            <span>
              <strong>{h.titel}</strong> <span className="badge">{h.wert}/10</span>
              <span className="muted small">
                {' '}
                {Math.round(h.ende - h.start)} s · {h.grund}
              </span>
            </span>
          </button>
          <span className="row" style={{ marginTop: 0 }}>
            <button className="btn small" disabled={!!p.auftrag} onClick={() => exportiere([{ index: i, art: 'clip' }])}>
              {t('schnitt.hl.clip')}
            </button>
            <button className="btn small" disabled={!!p.auftrag} onClick={() => exportiere([{ index: i, art: 'short' }])}>
              {t('schnitt.hl.kurz')}
            </button>
          </span>
        </div>
      ))}
      {clips.length > 0 && (
        <>
          <div className="clip-raster">
            {clips.map((c) => (
              <figure key={c.name} className={c.name.includes('short') ? 'hoch' : ''}>
                <video src={c.url} controls preload="metadata" />
                <figcaption className="muted small">{c.name}</figcaption>
              </figure>
            ))}
          </div>
          <button className="btn small" onClick={() => void window.cs.schnittClipOrdner(p.id)}>
            {t('schnitt.hl.ordner')}
          </button>
        </>
      )}
    </div>
  )
}

function ProjektAnsicht({ p, ki, zurueck, loeschen, neuLaden }: { p: SchnittProjekt; ki: boolean; zurueck: () => void; loeschen: () => void; neuLaden: () => void }): React.JSX.Element {
  const t = useT()
  const video = useRef<HTMLVideoElement>(null)
  const [zeit, setZeit] = useState(0)
  const [sicher, setSicher] = useState(false)
  const [liste, setListe] = useState<SchnittListe | null>(null)
  const [geschnitten, setGeschnitten] = useState(true)
  // Eingabe der Richtung; null = die gespeicherte gilt
  const [richtungEingabe, setRichtung] = useState<string | null>(null)
  const richtung = richtungEingabe ?? p.richtung
  // neu laden, wenn der Rohschnitt fertig ist oder ein Auftrag (z. B. ein Änderungswunsch) endet
  useEffect(() => {
    if (p.rohschnitt && !p.auftrag) void window.cs.schnittListe(p.id).then(setListe)
  }, [p.id, p.rohschnitt, p.auftrag])
  const dauer = p.quelle?.dauer ?? 0
  // Vorschau des Schnitts: entfernte Stellen werden beim Abspielen übersprungen
  const zeitUpdate = (s: number): void => {
    setZeit(s)
    if (!geschnitten || !liste || !video.current || video.current.paused) return
    const weg = liste.entfernt.find((e) => !e.aus && s >= e.start && s < e.ende - 0.05)
    if (weg) video.current.currentTime = Math.max(...liste.entfernt.filter((e) => !e.aus && e.start <= weg.ende + 0.05 && e.ende >= weg.start).map((e) => e.ende))
  }
  const springe = (s: number): void => {
    if (video.current) video.current.currentTime = Math.max(0, Math.min(dauer, s))
  }
  const einstellen = (patch: Parameters<typeof window.cs.schnittEinstellungen>[1]): void => void window.cs.schnittEinstellungen(p.id, patch).then(neuLaden)
  const richtungUebernehmen = (): void => {
    setRichtung(null)
    if (richtung.trim() === p.richtung) return
    // Stil hängt an der Richtung: Rohschnitt danach neu rechnen
    void window.cs.schnittEinstellungen(p.id, { richtung }).then(() => (p.transkript ? window.cs.schnittRohschnittStart(p.id) : null)).then(neuLaden)
  }
  return (
    <Card title={p.name} badge={p.kanal}>
      <div className="row wrap" style={{ marginTop: 0, marginBottom: 12 }}>
        <button className="btn small" onClick={zurueck}>
          ← {t('schnitt.alle')}
        </button>
        <button className="btn small" onClick={() => (sicher ? loeschen() : setSicher(true))}>
          {sicher ? t('schnitt.loeschenSicher') : t('schnitt.loeschen')}
        </button>
      </div>
      <Zuschauen p={p} neuLaden={neuLaden} />
      {p.proxyUrl ? (
        <video ref={video} className="schnitt-player" src={`${p.proxyUrl}#t=0.1`} controls preload="metadata" onTimeUpdate={(e) => zeitUpdate(e.currentTarget.currentTime)} />
      ) : (
        <div className="thumb-placeholder schnitt-player">{t('schnitt.vorschauEntsteht')}</div>
      )}
      {p.wellenform && dauer > 0 && <Wellenform id={p.id} dauer={dauer} zeit={zeit} springe={springe} />}
      {p.leisteUrl && dauer > 0 && (
        <img
          className="schnitt-leiste"
          src={p.leisteUrl}
          alt={t('schnitt.leiste')}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            springe(((e.clientX - r.left) / r.width) * dauer)
          }}
        />
      )}
      {liste && dauer > 0 && <Zeitleiste p={p} liste={liste} setListe={setListe} zeit={zeit} springe={springe} />}
      {liste && (
        <label className="row" style={{ alignItems: 'center' }}>
          <input type="checkbox" checked={geschnitten} onChange={(e) => setGeschnitten(e.target.checked)} /> {t('schnitt.geschnittenAbspielen')}
        </label>
      )}
      <div className="row wrap" style={{ alignItems: 'center' }}>
        <label className="row" style={{ alignItems: 'center', marginTop: 0 }}>
          {t('schnitt.richtung')}
          <input className="input" list="schnitt-richtungen" style={{ width: 170 }} value={richtung} onChange={(e) => setRichtung(e.target.value)} onBlur={richtungUebernehmen} onKeyDown={(e) => e.key === 'Enter' && richtungUebernehmen()} />
        </label>
        <datalist id="schnitt-richtungen">
          {RICHTUNGEN.map((r) => (
            <option key={r} value={r}>
              {t(`richtung.${r}`)}
            </option>
          ))}
        </datalist>
        <span className="muted small">{t('schnitt.richtungHinweis')}</span>
      </div>
      {p.transkript && <NamenVorschlaege projekt={p.id} name={p.name} ki={ki} gewaehlt={neuLaden} />}
      {liste && <WunschFeld p={p} ki={ki} neuLaden={neuLaden} />}
      {liste && <Rohschnitt id={p.id} liste={liste} setListe={setListe} springe={springe} />}
      {liste && (
        <div className="schnitt-fertig">
          <div className="card-head">
            <h2>{t('schnitt.fertig.titel')}</h2>
          </div>
          <div className="row wrap" style={{ marginTop: 0 }}>
            <select className="input" style={{ flex: '0 0 200px' }} value={p.einstellungen.untertitel} aria-label={t('schnitt.fertig.untertitel')} onChange={(e) => einstellen({ untertitel: e.target.value as 'aus' | 'an' | 'karaoke' })}>
              <option value="aus">{t('schnitt.fertig.utAus')}</option>
              <option value="an">{t('schnitt.fertig.utAn')}</option>
              <option value="karaoke">{t('schnitt.fertig.utKaraoke')}</option>
            </select>
            <select className="input" style={{ flex: '0 0 200px' }} value={p.einstellungen.format} aria-label={t('schnitt.fertig.format')} onChange={(e) => einstellen({ format: e.target.value as '16:9' | '9:16' })}>
              <option value="16:9">{t('schnitt.fertig.quer')}</option>
              <option value="9:16">{t('schnitt.fertig.hoch')}</option>
            </select>
            <label className="row" style={{ alignItems: 'center', marginTop: 0 }}>
              <input type="checkbox" checked={p.einstellungen.zooms} onChange={(e) => einstellen({ zooms: e.target.checked })} /> {t('schnitt.fertig.zooms')}
            </label>
            <button className="btn primary" disabled={!!p.auftrag} onClick={() => void window.cs.schnittVorschau(p.id).then(neuLaden)}>
              {t('schnitt.fertig.vorschau')}
            </button>
            <button className="btn" disabled={!!p.auftrag} title={t('schnitt.bibVerteilenHinweis')} onClick={() => void window.cs.schnittBibVerteilen(p.id).then(neuLaden)}>
              {t('schnitt.bibVerteilen')}
            </button>
          </div>
          {p.einstellungen.format === '9:16' && <p className="muted small">{t('schnitt.fertig.hochHinweis')}</p>}
          <EffektListe p={p} springe={springe} neuLaden={neuLaden} />
          {p.vorschauUrl && <video className="schnitt-player" src={`${p.vorschauUrl}#t=0.1`} controls preload="metadata" style={{ marginTop: 10, ...(p.einstellungen.format === '9:16' ? { aspectRatio: '9 / 16', maxHeight: 520, width: 'auto', marginInline: 'auto' } : {}) }} />}
        </div>
      )}
      {p.quelle && <Spuren p={p} neuLaden={neuLaden} />}
      {liste && <Export p={p} neuLaden={neuLaden} />}
      {p.transkript && <Highlights p={p} ki={ki} springe={springe} neuLaden={neuLaden} />}
      <Transkript id={p.id} bereit={p.transkript} zeit={zeit} springe={springe} liste={liste} setListe={setListe} />
      {p.quelle && (
        <dl className="facts" style={{ marginTop: 12 }}>
          <dt>{t('schnitt.info.laenge')}</dt>
          <dd>{zeitText(p.quelle.dauer)}</dd>
          <dt>{t('schnitt.info.bild')}</dt>
          <dd>
            {t('schnitt.info.bildWert', { breite: p.quelle.breite, hoehe: p.quelle.hoehe, fps: p.quelle.fps })}
            {p.quelle.audio ? '' : `, ${t('schnitt.info.ohneTon')}`}
          </dd>
          <dt>{t('schnitt.info.rohvideo')}</dt>
          <dd title={p.quelle.pfad}>{t('schnitt.info.bleibt', { name: p.quelle.pfad.split(/[\\/]/).pop() ?? '', groesse: groesseText(p.quelle.groesse) })}</dd>
        </dl>
      )}
    </Card>
  )
}

export function SchnittTab(): React.JSX.Element {
  const t = useT()
  const { profil } = useProfil()
  const [projekte, setProjekte] = useState<SchnittProjekt[]>([])
  const [offen, setOffen] = useState<string | null>(() => abholen('schnitt'))
  const [kontoWahl, setKonto] = useState<string | null>(null)
  const [ki, setKi] = useState(false)
  useEffect(() => {
    void window.cs.thumbKiStand().then((s) => setKi(s.ki))
    const sprung = (e: Event): void => {
      const d = (e as CustomEvent<{ tab: string; ziel?: string }>).detail
      if (d.tab === 'schnitt' && abholen('schnitt')) setOffen(d.ziel ?? null)
    }
    window.addEventListener(OEFFNE_EREIGNIS, sprung)
    return () => window.removeEventListener(OEFFNE_EREIGNIS, sprung)
  }, [])
  const [fehler, setFehler] = useState<string | null>(null)
  const laden = useCallback(() => void window.cs.schnittProjekte().then(setProjekte, (e: unknown) => setFehler(fehlerText(e))), [])
  useEffect(laden, [laden])
  // solange etwas läuft, alle 2 Sekunden auffrischen
  const laeuft = projekte.some((p) => p.auftrag && p.auftrag.state !== 'failed')
  useEffect(() => {
    if (!laeuft) return
    const timer = setInterval(laden, 2000)
    return () => clearInterval(timer)
  }, [laeuft, laden])

  const konten = profil?.konten ?? []
  const kontoId = kontoWahl && konten.some((k) => k.id === kontoWahl) ? kontoWahl : (konten[0]?.id ?? '')
  const importieren = async (): Promise<void> => {
    setFehler(null)
    try {
      const id = await window.cs.schnittImport(kontoId)
      if (id) {
        setOffen(id)
        laden()
      }
    } catch (err) {
      setFehler(fehlerText(err))
    }
  }
  const aktiv = projekte.find((p) => p.id === offen)

  return (
    <>
      <PageHeader title={t('leer.schnitt.titel')} subtitle={t('schnitt.untertitel')} />
      {fehler && <p className="warn">{fehler}</p>}
      <div className="grid">
        {aktiv ? (
          <ProjektAnsicht
            p={aktiv}
            ki={ki}
            neuLaden={laden}
            zurueck={() => setOffen(null)}
            loeschen={() =>
              void window.cs.schnittLoeschen(aktiv.id).then(() => {
                setOffen(null)
                laden()
              })
            }
          />
        ) : (
          <>
            <Card title={t('schnitt.neu.titel')}>
              <p className="muted small">{t('schnitt.neu.hinweis')}</p>
              {konten.length === 0 ? (
                <p className="muted">{t('schnitt.neu.keinKonto')}</p>
              ) : (
                <div className="row wrap">
                  <select className="input" value={kontoId} aria-label={t('schnitt.neu.konto')} onChange={(e) => setKonto(e.target.value)} style={{ flex: '0 0 220px' }}>
                    {konten.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name.trim() || t('konten.unbenannt')} · {t(`plattform.${k.plattform}` as Schluessel)}
                      </option>
                    ))}
                  </select>
                  <button className="btn primary" onClick={() => void importieren()}>
                    {t('schnitt.neu.waehlen')}
                  </button>
                </div>
              )}
            </Card>
            <Card title={t('schnitt.projekte')} badge={`${projekte.length}`}>
              {projekte.length === 0 && <p className="muted">{t('schnitt.keineProjekte')}</p>}
              {projekte.map((p) => (
                <button key={p.id} className="schnitt-projekt" onClick={() => setOffen(p.id)}>
                  {p.leisteUrl ? <img src={p.leisteUrl} alt="" /> : <span className="thumb-placeholder" />}
                  <span>
                    <strong>{p.name}</strong>
                    <span className="muted small">
                      {p.kanal} · {t(`plattform.${p.plattform}` as Schluessel)}
                      {p.quelle?.dauer ? ` · ${zeitText(p.quelle.dauer)}` : ''}
                      {p.auftrag ? ` · ${p.auftrag.state === 'failed' ? t('schnitt.fehlerKurz') : p.auftrag.step || t('schnitt.wartet')}` : ''}
                    </span>
                  </span>
                </button>
              ))}
            </Card>
            <EffektBibliothek />
          </>
        )}
      </div>
    </>
  )
}
