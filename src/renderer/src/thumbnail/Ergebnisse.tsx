import { useEffect, useState } from 'react'
import { FORMATE_EXPORT, type ExportFormat, type ThumbAuftragInfo, type VarianteInfo } from '@shared/thumbnail'
import type { CsApi } from '@shared/app'
import { fehlerText, useT } from '../i18n'
import type { AuftragsVorschlag } from './Auftrag'

type VideoDaten = NonNullable<Awaited<ReturnType<CsApi['thumbVideoErgebnis']>>>

/** Aufträge mit Fortschritt; ein Klick öffnet die Varianten (ROADMAP 4.10) */
export function AuftragsListe({ offen, setzeOffen, vorbildHinweise, vorschlagen }: { offen: string | null; setzeOffen: (id: string | null) => void; vorbildHinweise: boolean; vorschlagen: (v: AuftragsVorschlag) => void }): React.JSX.Element {
  const t = useT()
  const [auftraege, setAuftraege] = useState<ThumbAuftragInfo[]>([])
  useEffect(() => {
    let aktiv = true
    const laden = (): void => void window.cs.thumbAuftraege().then((a) => aktiv && setAuftraege(a))
    laden()
    const aus = window.cs.onJobsState(laden)
    return () => {
      aktiv = false
      aus()
    }
  }, [])
  if (!auftraege.length) return <p className="muted">{t('thumb.ergebnis.keine')}</p>
  // Änderungen stehen im Verlauf ihres Ursprungsauftrags, nicht als eigene Aufträge in der Liste (aus MoinStudio v0.37.0)
  const haupt = auftraege.filter((a) => !a.eltern || !auftraege.some((x) => x.id === a.eltern))
  const zuAuftrag = (id: string): ThumbAuftragInfo[] => auftraege.filter((a) => a.eltern === id).sort((x, y) => x.createdAt.localeCompare(y.createdAt))
  return (
    <ul className="auftraege">
      {haupt.map((a) => {
        const aenderungen = zuAuftrag(a.id)
        const status = [...aenderungen].reverse().find((x) => x.state !== 'done') ?? a
        return (
          <li key={a.id} className={`auftrag-zeile${offen === a.id ? ' offen' : ''}`}>
            <button type="button" className="auftrag-kopf" onClick={() => setzeOffen(offen === a.id ? null : a.id)}>
              <strong>{a.titel}</strong>
              <span className="muted small">
                {aenderungen.length > 0 && `${t('thumb.verlauf.anzahl', { anzahl: aenderungen.length })} · `}
                {t(`thumb.status.${status.state}`)}
                {status.state === 'running' && status.progress !== null ? ` · ${status.progress} %` : ''}
                {status.step && status.state !== 'done' ? ` · ${status.step}` : ''}
              </span>
            </button>
            {a.error && <p className="warn small">{a.error}</p>}
            {offen === a.id && a.state === 'done' && (a.art === 'video' ? <VideoErgebnisAnsicht jobId={a.id} vorschlagen={vorschlagen} /> : <Verlauf auftrag={a} aenderungen={aenderungen} vorbildHinweise={vorbildHinweise} />)}
            {offen === a.id && (
              <button type="button" className="btn small" onClick={() => void window.cs.thumbLoeschen(a.id).then(() => setzeOffen(null))}>
                {t(aenderungen.length ? 'thumb.verlauf.alleLoeschen' : 'thumb.ergebnis.loeschen')}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Verlauf eines Thumbnails wie ein Chat (aus MoinStudio v0.37.0): oben der Auftrag, darunter jede Änderung mit ihrem
 * Ergebnis, ganz unten das Eingabefeld. Geändert wird das gewählte Bild, sonst das neueste.
 */
function Verlauf({ auftrag, aenderungen, vorbildHinweise }: { auftrag: ThumbAuftragInfo; aenderungen: ThumbAuftragInfo[]; vorbildHinweise: boolean }): React.JSX.Element {
  const t = useT()
  const [wahl, setWahl] = useState<{ job: string; variante: number } | null>(null)
  const [text, setText] = useState('')
  const [meldung, setMeldung] = useState<string | null>(null)
  const [loeschen, setLoeschen] = useState<string | null>(null)
  const schritte = [auftrag, ...aenderungen]
  const neuestes = [...schritte].reverse().find((s) => s.state === 'done')
  const basis = wahl && schritte.some((s) => s.id === wahl.job) ? wahl : neuestes ? { job: neuestes.id, variante: 0 } : null
  const name = (b: { job: string; variante: number }): string => {
    const n = schritte.findIndex((s) => s.id === b.job)
    if (n < 0) return t('thumb.verlauf.geloescht')
    return n === 0 ? t('thumb.verlauf.variante', { nr: b.variante + 1 }) : t('thumb.verlauf.aenderung', { nr: n })
  }
  const senden = (): void => {
    if (!basis || !text.trim()) return
    setMeldung(null)
    window.cs.thumbAendern(basis.job, basis.variante, text).then(
      () => {
        setText('')
        setWahl(null)
      },
      (e: unknown) => setMeldung(fehlerText(e))
    )
  }
  const waehle = (job: string) => (i: number) => setWahl({ job, variante: i })
  return (
    <div className="verlauf">
      <Varianten jobId={auftrag.id} vorbildHinweise={vorbildHinweise} gewaehlt={basis?.job === auftrag.id ? basis.variante : null} onWaehle={waehle(auftrag.id)} />
      {aenderungen.map((a, n) => {
        // Nur sagen, woran geändert wurde, wenn es nicht einfach das Bild direkt darüber ist
        const vorher = n === 0 ? auftrag.id : aenderungen[n - 1]!.id
        const woran = a.basis && (a.basis.job !== vorher || (n === 0 && a.basis.variante > 0)) ? name(a.basis) : null
        return (
          <div key={a.id} className="verlauf-schritt">
            <div className="verlauf-wunsch">
              <span className="verlauf-nr">{t('thumb.verlauf.aenderung', { nr: n + 1 })}</span>
              <span>„{a.wunsch}“</span>
              {woran && <span className="muted small">{t('thumb.verlauf.an', { was: woran })}</span>}
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  if (loeschen === a.id) void window.cs.thumbLoeschen(a.id).then(() => setLoeschen(null))
                  else setLoeschen(a.id)
                }}
              >
                {loeschen === a.id ? t('thumb.verlauf.wirklich') : t('thumb.verlauf.loeschen')}
              </button>
            </div>
            {a.state === 'done' ? (
              <Varianten jobId={a.id} vorbildHinweise={vorbildHinweise} gewaehlt={basis?.job === a.id ? basis.variante : null} onWaehle={waehle(a.id)} />
            ) : (
              <p className={a.state === 'failed' ? 'warn small' : 'muted small'}>
                {a.state === 'failed' ? a.error : `${t(`thumb.status.${a.state}`)}${a.step ? ` · ${a.step}` : ''}`}
              </p>
            )}
          </div>
        )
      })}
      {basis && (
        <div className="verlauf-eingabe">
          <span className="muted small">
            {t('thumb.verlauf.aendert', { was: name(basis) })}
            {!wahl && schritte.length > 1 ? ` ${t('thumb.verlauf.neuestes')}` : ''}
          </span>
          <div className="row">
            <input className="input" placeholder={t('thumb.aendern.platzhalter')} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && text.trim() && senden()} />
            <button type="button" className="btn primary" disabled={!text.trim()} onClick={senden}>
              {t('thumb.aendern.knopf')}
            </button>
          </div>
          {meldung && <p className="warn small">{meldung}</p>}
        </div>
      )}
    </div>
  )
}

function Varianten({ jobId, vorbildHinweise, gewaehlt, onWaehle }: { jobId: string; vorbildHinweise: boolean; gewaehlt: number | null; onWaehle: (i: number) => void }): React.JSX.Element {
  const t = useT()
  const [varianten, setVarianten] = useState<VarianteInfo[] | null>(null)
  const [gross, setGross] = useState<string | null>(null)
  useEffect(() => {
    let aktiv = true
    void window.cs.thumbErgebnis(jobId).then((v) => aktiv && setVarianten(v))
    return () => {
      aktiv = false
    }
  }, [jobId])
  if (!varianten) return <p className="muted small">{t('app.laden')}</p>
  return (
    <>
      <div className="variant-grid">
        {varianten.map((v, i) => (
          <VarianteKarte key={i} jobId={jobId} index={i} v={v} vorbildHinweise={vorbildHinweise} gross={setGross} gewaehlt={gewaehlt === i} waehle={() => onWaehle(i)} />
        ))}
      </div>
      {gross && (
        <div className="grossansicht" role="dialog" onClick={() => setGross(null)}>
          <img src={gross} alt="" />
        </div>
      )}
    </>
  )
}

function VarianteKarte({ jobId, index, v, vorbildHinweise, gross, gewaehlt, waehle }: { jobId: string; index: number; v: VarianteInfo; vorbildHinweise: boolean; gross: (b: string) => void; gewaehlt: boolean; waehle: () => void }): React.JSX.Element {
  const t = useT()
  const [format, setFormat] = useState<ExportFormat>('16:9')
  const [meldung, setMeldung] = useState<string | null>(null)
  const exportiere = (typ: 'png' | 'jpg' | 'psd'): void => {
    setMeldung(null)
    window.cs
      .thumbExport(jobId, index, format, typ)
      .then((p) => p && setMeldung(t('thumb.export.gespeichert', { datei: p.split(/[\\/]/).pop() ?? p })))
      .catch((e: unknown) => setMeldung(fehlerText(e)))
  }
  return (
    <figure className={gewaehlt ? 'variant gewaehlt' : 'variant'}>
      {v.bild ? (
        <button type="button" className="bild-knopf" onClick={() => gross(v.bild!)} title={t('thumb.ergebnis.gross')}>
          <img src={v.bild} alt={v.titel} />
        </button>
      ) : (
        <p className="warn small">{v.fehler ?? t('thumb.fehler.render')}</p>
      )}
      <figcaption>
        <strong>{v.titel}</strong>
        <p className="muted small">{v.warum}</p>
        {vorbildHinweise && v.vorbild && (
          <p className="small">
            {t('thumb.ergebnis.vorbild')}{' '}
            {v.vorbild.link ? (
              <a href={v.vorbild.link} target="_blank" rel="noreferrer">
                {v.vorbild.titel ?? v.vorbild.kanal}
              </a>
            ) : (
              (v.vorbild.titel ?? v.vorbild.kanal)
            )}
          </p>
        )}
        <details className="pruefung small">
          <summary>
            {t('thumb.pruefung.titel')}
            {v.pruefung.korrekturen > 0 ? ` · ${t('thumb.pruefung.korrigiert', { anzahl: v.pruefung.korrekturen })}` : ''}
          </summary>
          {v.pruefung.technisch.length ? (
            <ul>
              {v.pruefung.technisch.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t('thumb.pruefung.technischOk')}</p>
          )}
          {v.pruefung.ki === null ? <p className="muted">{t('thumb.pruefung.ohneBildKi')}</p> : v.pruefung.ki.length ? <ul>{v.pruefung.ki.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="muted">{t('thumb.pruefung.kiOk')}</p>}
        </details>
        {v.bild && (
          <>
            <div className="row export">
              <select className="input mini" value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
                {FORMATE_EXPORT.map((f) => (
                  <option key={f} value={f}>
                    {t(`thumb.format.${f}`)}
                  </option>
                ))}
              </select>
              {(['png', 'jpg', 'psd'] as const).map((typ) => (
                <button key={typ} type="button" className="btn small" onClick={() => exportiere(typ)} title={typ === 'psd' ? t('thumb.export.psdHinweis') : undefined}>
                  {typ.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="row">
              <button type="button" className={gewaehlt ? 'btn small primary' : 'btn small'} aria-pressed={gewaehlt} onClick={waehle}>
                ✏️ {t(gewaehlt ? 'thumb.verlauf.gewaehlt' : 'thumb.verlauf.waehlen')}
              </button>
            </div>
          </>
        )}
        {meldung && <p className="muted small">{meldung}</p>}
      </figcaption>
    </figure>
  )
}

function VideoErgebnisAnsicht({ jobId, vorschlagen }: { jobId: string; vorschlagen: (v: AuftragsVorschlag) => void }): React.JSX.Element {
  const t = useT()
  const [d, setD] = useState<VideoDaten | null>(null)
  useEffect(() => {
    let aktiv = true
    void window.cs.thumbVideoErgebnis(jobId).then((x) => aktiv && setD(x))
    return () => {
      aktiv = false
    }
  }, [jobId])
  if (!d) return <p className="muted small">{t('app.laden')}</p>
  return (
    <div className="video-ergebnis">
      {d.inhalt && <p>{d.inhalt}</p>}
      {!d.mitKi && <p className="muted small">{t('thumb.video.ohneBildKi')}</p>}
      {d.ideen.length > 0 && (
        <ul className="ideen">
          {d.ideen.map((i, k) => (
            <li key={k}>
              <strong>{i.beschreibung}</strong>
              <span className="muted small">
                {' '}
                {i.warum}
                {i.zeitpunkt ? ` · ${i.zeitpunkt}` : ''}
              </span>
              <button type="button" className="btn small" onClick={() => vorschlagen({ beschreibung: i.beschreibung, freunde: i.freunde })}>
                {t('thumb.video.ideeNutzen')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3>{t('thumb.video.momente')}</h3>
      <div className="momente">
        {d.momente.map((m, k) => (
          <figure key={k}>
            {m.bild && <img src={m.bild} alt={m.grund} />}
            <figcaption className="small">
              {m.grund}
              {m.pfad && (
                <button type="button" className="btn small" onClick={() => vorschlagen({ hintergrund: m.pfad! })}>
                  {t('thumb.video.alsHintergrund')}
                </button>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}
