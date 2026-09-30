// Herkunft: MoinStudio src/renderer/src/components/KartenVideo.tsx (MIT), mit Texten je Plattform, Cross-Posting und
// Veröffentlichen (Upload-Paket, optional YouTube über die offizielle Anmeldung).
import { useEffect, useState } from 'react'
import type { Schluessel } from '@shared/i18n'
import type { PlanungAenderung, PlanungKarte, PlanungThumbStand } from '@shared/planung'
import type { SchnittProjekt } from '@shared/schnitt'
import { oeffne } from '../navigation'
import { fehlerText, useT } from '../i18n'

type T = ReturnType<typeof useT>

/** Stand eines Schnitt-Projekts in einfachen Worten */
function schnittStand(p: SchnittProjekt, t: T): string {
  if (p.auftrag && p.auftrag.state !== 'failed') return t('planung.video.laeuft', { schritt: p.auftrag.step || t('schnitt.laeuft'), prozent: p.auftrag.progress !== null ? ` (${Math.round(p.auftrag.progress)} %)` : '' })
  if (p.auftrag?.state === 'failed') return t('schnitt.fehlerText', { fehler: p.auftrag.error ?? '' })
  if (p.exportiert) return t('planung.video.exportiert')
  if (p.rohschnitt) return t('planung.video.rohschnitt')
  if (p.transkript) return t('planung.video.transkript')
  return t('planung.video.importiert')
}

/**
 * Planungskarte ↔ Schnitt und Thumbnail (ROADMAP 6.2): Rohvideo schneiden, Thumbnail erstellen und wählen,
 * Titel/Text/Kapitel aus dem Export übernehmen, Cross-Posting planen, veröffentlichen.
 */
export function KartenVideo({ karte, ersetze, aendern, youtubeVerbunden }: { karte: PlanungKarte; ersetze: (k: PlanungKarte) => void; aendern: (a: PlanungAenderung) => void; youtubeVerbunden: boolean }): React.JSX.Element {
  const t = useT()
  const [projekte, setProjekte] = useState<SchnittProjekt[]>([])
  const [thumb, setThumb] = useState<PlanungThumbStand | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [kopiert, setKopiert] = useState<string | null>(null)

  const projekt = projekte.find((p) => p.id === karte.schnitt) ?? null
  const thumbLaeuft = !!thumb?.auftrag && ['queued', 'running', 'paused', 'waiting-limit'].includes(thumb.auftrag.state)
  const schnittLaeuft = !!projekt?.auftrag && projekt.auftrag.state !== 'failed'

  useEffect(() => {
    let aktiv = true
    const laden = (): void => {
      void window.cs.schnittProjekte().then((p) => aktiv && setProjekte(p))
      if (karte.thumbnail?.auftrag) void window.cs.planungThumbVarianten(karte.id).then((x) => aktiv && setThumb(x))
    }
    laden()
    // solange etwas läuft, alle 2 Sekunden nachsehen
    const timer = thumbLaeuft || schnittLaeuft ? setInterval(laden, 2000) : null
    return () => {
      aktiv = false
      if (timer) clearInterval(timer)
    }
  }, [karte.id, karte.schnitt, karte.thumbnail?.auftrag, karte.thumbnail?.bild, thumbLaeuft, schnittLaeuft])

  const tu = (p: Promise<PlanungKarte | null>): void => {
    setFehler(null)
    p.then((k) => k && ersetze(k)).catch((e: unknown) => setFehler(fehlerText(e)))
  }
  const kopiere = (name: string, text: string): void => {
    void navigator.clipboard.writeText(text).then(() => {
      setKopiert(name)
      setTimeout(() => setKopiert(null), 1500)
    })
  }

  const passend = projekte.filter((p) => p.kontoId === karte.kontoId)
  return (
    <div className="details-block karten-video">
      <span className="muted small">{t('planung.video.titel')}</span>

      <div className="video-zeile">
        <strong>{t('tab.schnitt')}</strong>
        {karte.schnitt ? (
          <>
            <span className="muted small">{projekt ? `${projekt.name} · ${schnittStand(projekt, t)}` : t('planung.video.fehlt')}</span>
            <span className="row" style={{ marginTop: 0 }}>
              {projekt && (
                <button className="btn small" onClick={() => oeffne('schnitt', projekt.id)}>
                  {t('planung.video.oeffnen')}
                </button>
              )}
              <button className="btn small" onClick={() => aendern({ schnitt: null })}>
                {t('planung.video.loesen')}
              </button>
            </span>
          </>
        ) : (
          <span className="row wrap" style={{ marginTop: 0 }}>
            <button className="btn small primary" onClick={() => tu(window.cs.planungSchneiden(karte.id))}>
              {t('planung.video.schneiden')}
            </button>
            {passend.length > 0 && (
              <select className="input small" value="" onChange={(e) => e.target.value && aendern({ schnitt: e.target.value })} aria-label={t('planung.video.vorhanden')}>
                <option value="">{t('planung.video.vorhanden')}</option>
                {passend.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </span>
        )}
      </div>

      <div className="video-zeile">
        <strong>{t('tab.thumbnail')}</strong>
        {thumbLaeuft && thumb?.auftrag && (
          <span className="muted small">
            {t('planung.video.thumbLaeuft', { schritt: thumb.auftrag.step || t('schnitt.wartet') })}
            {thumb.auftrag.progress !== null && ` (${Math.round(thumb.auftrag.progress)} %)`}
          </span>
        )}
        {thumb?.auftrag?.state === 'failed' && <span className="warn small">{t('schnitt.fehlerText', { fehler: thumb.auftrag.error ?? '' })}</span>}
        {thumb && thumb.varianten.length > 0 ? (
          <>
            <span className="muted small">{karte.thumbnail?.gewaehlt ? t('planung.video.thumbGewaehlt') : t('planung.video.thumbWaehlen')}</span>
            <div className="thumb-wahl">
              {thumb.varianten.map((v) => {
                const an = karte.thumbnail?.gewaehlt && karte.thumbnail.bild === v.pfad
                return (
                  <button key={v.pfad} className={`thumb-knopf${an ? ' on' : ''}`} title={v.titel} onClick={() => tu(window.cs.planungThumbWaehlen(karte.id, v.pfad))}>
                    <img src={v.url} alt={v.titel} />
                    {an && <span className="thumb-haken">✓</span>}
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          karte.bildUrl && <img className="thumb-einzeln" src={karte.bildUrl} alt={t('tab.thumbnail')} />
        )}
        {!thumbLaeuft && (
          <button className={`btn small${karte.thumbnail ? '' : ' primary'}`} onClick={() => tu(window.cs.planungThumbnail(karte.id))}>
            {karte.thumbnail ? t('planung.video.thumbNeu') : t('planung.video.thumbErstellen')}
          </button>
        )}
        {!karte.thumbnail && <span className="muted small">{t('planung.video.thumbHinweis')}</span>}
      </div>

      {karte.texte && (
        <div className="video-zeile">
          <strong>{t('planung.video.texte', { plattform: t(`plattform.${karte.texte.plattform}` as Schluessel) })}</strong>
          <span className="muted small">{t('planung.video.texteHinweis')}</span>
          {(
            [
              ['titel', t('planung.paket.titel'), karte.texte.titel],
              ['text', t('schnitt.export.text'), karte.texte.beschreibung],
              ['kapitel', t('planung.video.kapitel'), karte.texte.kapitel]
            ] as const
          )
            .filter(([, , text]) => text.trim())
            .map(([id, name, text]) => (
              <div key={id} className="yt-feld">
                <span className="yt-kopf">
                  <span className="small">{name}</span>
                  <button className="btn small" onClick={() => kopiere(id, text)}>
                    {kopiert === id ? t('schnitt.export.kopiert') : t('schnitt.export.kopieren')}
                  </button>
                </span>
                <pre className="yt-text">{text}</pre>
              </div>
            ))}
        </div>
      )}

      <div className="video-zeile">
        <strong>{t('planung.cross.titel')}</strong>
        <span className="muted small">{t('planung.cross.hinweis')}</span>
        {karte.crossposting.map((c, i) => (
          <label key={`${c.termin}-${c.plattform}-${i}`} className="punkt small">
            <input type="checkbox" checked={c.erledigt} onChange={() => aendern({ crossposting: karte.crossposting.map((x, j) => (j === i ? { ...x, erledigt: !x.erledigt } : x)) })} />
            <span className={c.erledigt ? 'erledigt' : ''}>
              <strong>{c.termin.replace('T', ' ')}</strong> {t(`plattform.${c.plattform}` as Schluessel)}
              {c.art === 'kurz' && c.von !== null && <span className="muted"> ({Math.round(c.von)}–{Math.round(c.bis ?? c.von)} s)</span>}: {c.titel}
            </span>
          </label>
        ))}
        <button className="btn small" disabled={!karte.termin} title={karte.termin ? undefined : t('planung.fehler.ohneTermin')} onClick={() => tu(window.cs.planungCrossPlan(karte.id))}>
          {karte.crossposting.length ? t('planung.cross.neu') : t('planung.cross.los')}
        </button>
      </div>

      <div className="video-zeile">
        <strong>{t('planung.upload.titel')}</strong>
        <span className="muted small">{t('planung.upload.hinweis')}</span>
        <span className="row wrap" style={{ marginTop: 0 }}>
          <button className="btn small" onClick={() => void window.cs.planungPaket(karte.id).then((o) => o && setMeldung(t('planung.upload.paketFertig', { ordner: o })), (e: unknown) => setFehler(fehlerText(e)))}>
            {t('planung.upload.paket')}
          </button>
          {youtubeVerbunden && projekt?.exportiert && (
            <button className="btn small" title={t('planung.upload.ungetestet')} onClick={() => void window.cs.uploadStart(karte.id).then(() => setMeldung(t('planung.upload.laeuft')), (e: unknown) => setFehler(fehlerText(e)))}>
              {t('planung.upload.youtube')}
            </button>
          )}
        </span>
      </div>
      {meldung && <p className="ok-note small">{meldung}</p>}
      {fehler && <p className="warn small">{fehler}</p>}
    </div>
  )
}
