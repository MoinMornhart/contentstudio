import { useCallback, useEffect, useState } from 'react'
import type { Stilbuch, Vorbild } from '@shared/thumbnail'
import { Vorschau } from '../profil/Bausteine'
import { fehlerText, useT } from '../i18n'

/**
 * Vorbilder und Stilbuch eines Kanals (ROADMAP 4.1): hinzufügen per Datei, Ablegen, Zwischenablage oder Video-Link;
 * gewichten, deaktivieren, löschen; Stilbuch mit Regeln und Belegen ansehen und neu erstellen.
 */
export function VorbilderKarte({ kontoId, bildKi }: { kontoId: string; bildKi: boolean }): React.JSX.Element {
  const t = useT()
  const [liste, setListe] = useState<Vorbild[]>([])
  const [buch, setBuch] = useState<Stilbuch | null>(null)
  const [link, setLink] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [ueber, setUeber] = useState(false)

  const holen = useCallback(async (): Promise<[Vorbild[], Stilbuch | null]> => Promise.all([window.cs.vorbildListe(kontoId), window.cs.stilbuch(kontoId)]), [kontoId])
  useEffect(() => {
    let aktiv = true
    void holen().then(([l, b]) => {
      if (!aktiv) return
      setListe(l)
      setBuch(b)
    })
    // Stilbuch aktualisiert sich, wenn die Aufgabe „Stilbuch erstellen“ fertig ist
    const aus = window.cs.onJobsState(() => void window.cs.stilbuch(kontoId).then((b) => aktiv && setBuch(b)))
    return () => {
      aktiv = false
      aus()
    }
  }, [holen, kontoId])

  const mach = (fn: () => Promise<Vorbild[]>): void => {
    setFehler(null)
    setLaeuft(true)
    fn()
      .then(setListe)
      .catch((e: unknown) => setFehler(fehlerText(e)))
      .finally(() => setLaeuft(false))
  }

  return (
    <section className="card vorbilder">
      <div className="card-head">
        <h2>{t('thumb.vorbild.titel')}</h2>
        <span className="badge">{t('thumb.vorbild.anzahl', { anzahl: liste.length })}</span>
      </div>
      <p className="muted small">{t('thumb.vorbild.text')}</p>
      <div
        className={`ablage${ueber ? ' ueber' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setUeber(true)
        }}
        onDragLeave={() => setUeber(false)}
        onDrop={(e) => {
          e.preventDefault()
          setUeber(false)
          const pfade = [...e.dataTransfer.files].map((f) => window.cs.dateiPfad(f)).filter(Boolean)
          if (pfade.length) mach(() => window.cs.vorbildHinzu(kontoId, { art: 'ablegen', pfade }))
        }}
      >
        {t('thumb.vorbild.ablegen')}
      </div>
      <div className="row">
        <button type="button" className="btn small" disabled={laeuft} onClick={() => mach(() => window.cs.vorbildHinzu(kontoId, { art: 'datei' }))}>
          {t('thumb.vorbild.datei')}
        </button>
        <button type="button" className="btn small" disabled={laeuft} onClick={() => mach(() => window.cs.vorbildHinzu(kontoId, { art: 'zwischenablage' }))}>
          {t('thumb.vorbild.einfuegen')}
        </button>
        <input className="input" value={link} placeholder={t('thumb.vorbild.linkPlatzhalter')} onChange={(e) => setLink(e.target.value)} />
        <button
          type="button"
          className="btn small"
          disabled={laeuft || !link.trim()}
          onClick={() =>
            mach(async () => {
              const l = await window.cs.vorbildHinzu(kontoId, { art: 'link', url: link.trim() })
              setLink('')
              return l
            })
          }
        >
          {t('thumb.vorbild.link')}
        </button>
      </div>
      {fehler && <p className="warn small">{fehler}</p>}
      {liste.length > 0 && (
        <ul className="vorbild-grid">
          {liste.map((v) => (
            <li key={v.id} className={`vorbild${v.aktiv ? '' : ' aus'}`}>
              {v.datei && <Vorschau datei={v.datei} />}
              <div className="vorbild-info small">
                <strong>{v.titel ?? t('thumb.vorbild.ohneTitel')}</strong>
                {v.kanal && <span className="muted">{v.kanal}</span>}
                <span className="muted">{v.ki ? v.ki.typ : t('thumb.vorbild.nurGemessen')}</span>
                <span className="farben">
                  {v.lokal?.farben.map((f) => (
                    <span key={f.farbe} className="swatch" style={{ background: f.farbe }} title={f.farbe} />
                  ))}
                </span>
              </div>
              <div className="vorbild-aktionen">
                <label className="small">
                  {t('thumb.vorbild.gewicht')}{' '}
                  <select className="input mini" value={v.gewicht} onChange={(e) => mach(() => window.cs.vorbildAendern(kontoId, v.id, { gewicht: Number(e.target.value) }))}>
                    {[1, 2, 3, 4, 5].map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="switch small">
                  <input type="checkbox" checked={v.aktiv} onChange={(e) => mach(() => window.cs.vorbildAendern(kontoId, v.id, { aktiv: e.target.checked }))} />
                  {t('thumb.vorbild.aktiv')}
                </label>
                <button type="button" className="icon-btn" title={t('darst.entfernen')} onClick={() => mach(() => window.cs.vorbildLoeschen(kontoId, v.id))}>
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="stilbuch">
        <div className="card-head">
          <h3>{t('thumb.stilbuch.titel')}</h3>
          <button type="button" className="btn small" onClick={() => void window.cs.stilbuchErstellen(kontoId).catch((e: unknown) => setFehler(fehlerText(e)))}>
            {bildKi ? t('thumb.stilbuch.mitKi') : t('thumb.stilbuch.neu')}
          </button>
        </div>
        {!bildKi && <p className="muted small">{t('thumb.stilbuch.ohneBildKi')}</p>}
        {buch ? (
          <>
            <p className="muted small">{t(`thumb.stilbuch.quelle.${buch.quelle}`)}</p>
            <ul className="regeln">
              {buch.regeln.map((r, i) => (
                <li key={i}>
                  <span className="badge">{t(`thumb.kategorie.${r.kategorie}`)}</span> {r.text}
                  {r.belege.length > 0 && <span className="muted small"> · {t('thumb.stilbuch.belege', { anzahl: r.belege.length })}</span>}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="muted small">{t('thumb.stilbuch.keins')}</p>
        )}
      </div>
    </section>
  )
}
