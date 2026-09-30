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
  return (
    <ul className="auftraege">
      {auftraege.map((a) => (
        <li key={a.id} className={`auftrag-zeile${offen === a.id ? ' offen' : ''}`}>
          <button type="button" className="auftrag-kopf" onClick={() => setzeOffen(offen === a.id ? null : a.id)}>
            <strong>{a.titel}</strong>
            <span className="muted small">
              {t(`thumb.status.${a.state}`)}
              {a.state === 'running' && a.progress !== null ? ` · ${a.progress} %` : ''}
              {a.step && a.state !== 'done' ? ` · ${a.step}` : ''}
            </span>
          </button>
          {a.error && <p className="warn small">{a.error}</p>}
          {offen === a.id && a.state === 'done' && (a.art === 'video' ? <VideoErgebnisAnsicht jobId={a.id} vorschlagen={vorschlagen} /> : <Varianten jobId={a.id} vorbildHinweise={vorbildHinweise} />)}
          {offen === a.id && (
            <button type="button" className="btn small" onClick={() => void window.cs.thumbLoeschen(a.id).then(() => setzeOffen(null))}>
              {t('thumb.ergebnis.loeschen')}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

function Varianten({ jobId, vorbildHinweise }: { jobId: string; vorbildHinweise: boolean }): React.JSX.Element {
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
          <VarianteKarte key={i} jobId={jobId} index={i} v={v} vorbildHinweise={vorbildHinweise} gross={setGross} />
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

function VarianteKarte({ jobId, index, v, vorbildHinweise, gross }: { jobId: string; index: number; v: VarianteInfo; vorbildHinweise: boolean; gross: (b: string) => void }): React.JSX.Element {
  const t = useT()
  const [format, setFormat] = useState<ExportFormat>('16:9')
  const [wunsch, setWunsch] = useState('')
  const [meldung, setMeldung] = useState<string | null>(null)
  const exportiere = (typ: 'png' | 'jpg' | 'psd'): void => {
    setMeldung(null)
    window.cs
      .thumbExport(jobId, index, format, typ)
      .then((p) => p && setMeldung(t('thumb.export.gespeichert', { datei: p.split(/[\\/]/).pop() ?? p })))
      .catch((e: unknown) => setMeldung(fehlerText(e)))
  }
  return (
    <figure className="variant">
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
              <input className="input" value={wunsch} placeholder={t('thumb.aendern.platzhalter')} onChange={(e) => setWunsch(e.target.value)} />
              <button
                type="button"
                className="btn small"
                disabled={!wunsch.trim()}
                onClick={() =>
                  void window.cs
                    .thumbAendern(jobId, index, wunsch)
                    .then(() => {
                      setWunsch('')
                      setMeldung(t('thumb.aendern.gestartet'))
                    })
                    .catch((e: unknown) => setMeldung(fehlerText(e)))
                }
              >
                {t('thumb.aendern.knopf')}
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
