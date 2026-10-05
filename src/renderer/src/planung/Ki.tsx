// Herkunft: MoinStudio src/renderer/src/components/PlanungClaude.tsx (MIT), mit der KI-Schicht und übersetzbar.
import { useEffect, useState } from 'react'
import { teileTermin } from '@shared/kalender'
import type { PlanungKarte, PlanungKiArt, PlanungKiErgebnis, PlanungKiStand } from '@shared/planung'
import { fehlerText, useI18n, useT } from '../i18n'

/** Startet einen KI-Auftrag der Planung und verfolgt ihn, bis er fertig ist. */
function useKiAuftrag<A extends PlanungKiArt>(art: A): {
  stand: PlanungKiStand | null
  ergebnis: Extract<PlanungKiErgebnis, { art: A }> | null
  laeuft: boolean
  fehler: string | null
  starte: (o?: { kontoId?: string; wunsch?: string; karte?: string; projekt?: string }) => void
} {
  const [auftrag, setAuftrag] = useState<string | null>(null)
  const [stand, setStand] = useState<PlanungKiStand | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const laeuft = !!auftrag && (!stand || !['done', 'failed', 'cancelled'].includes(stand.state))
  useEffect(() => {
    if (!auftrag || !laeuft) return
    const timer = setInterval(() => void window.cs.planungKiStand(auftrag).then(setStand), 1500)
    return () => clearInterval(timer)
  }, [auftrag, laeuft])
  return {
    stand,
    ergebnis: stand?.ergebnis?.art === art ? (stand.ergebnis as Extract<PlanungKiErgebnis, { art: A }>) : null,
    laeuft,
    fehler: fehler ?? (stand?.state === 'failed' ? (stand.error ?? '') : null),
    starte: (o) => {
      setFehler(null)
      setStand(null)
      window.cs.planungKi(art, o).then(setAuftrag, (e: unknown) => setFehler(fehlerText(e)))
    }
  }
}

function Fortschritt({ stand, text }: { stand: PlanungKiStand | null; text: string }): React.JSX.Element {
  const t = useT()
  const wartet = stand?.state === 'queued' || stand?.state === 'waiting-limit'
  return (
    <p className="muted small claude-laeuft">
      <span className="spinner" aria-hidden="true" />
      {wartet ? t(stand?.state === 'waiting-limit' ? 'planung.ki.limit' : 'planung.ki.wartet') : stand?.step || text}
    </p>
  )
}

/** Ideenfinder je Konto (ROADMAP 6.3) */
export function IdeenFinder({ kontoId, name, uebernehmen }: { kontoId: string; name: string; uebernehmen: (titel: string, idee: string) => Promise<void> }): React.JSX.Element {
  const t = useT()
  const a = useKiAuftrag('ideen')
  const [wunsch, setWunsch] = useState('')
  const [genommen, setGenommen] = useState<Set<string>>(new Set())
  return (
    <section className="ideen-finder">
      <div className="row wrap" style={{ marginTop: 0 }}>
        <input className="input" placeholder={t('planung.ideen.wunsch')} value={wunsch} onChange={(e) => setWunsch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !a.laeuft && a.starte({ kontoId, wunsch })} />
        <button className="btn primary" disabled={a.laeuft} onClick={() => a.starte({ kontoId, wunsch })}>
          {a.ergebnis ? t('planung.ideen.neu') : t('planung.ideen.los', { konto: name })}
        </button>
      </div>
      {a.laeuft && <Fortschritt stand={a.stand} text={t('planung.schritt.ideen')} />}
      {a.fehler && <p className="warn small">{a.fehler}</p>}
      {a.ergebnis && (
        <div className="ideen-liste">
          {a.ergebnis.ideen.map((i) => (
            <div key={i.titel} className="idee">
              <div className="idee-text">
                <strong>{i.titel}</strong>
                <span className="small">{i.idee}</span>
                <span className="muted small">{i.warum}</span>
              </div>
              <button className="btn small" disabled={genommen.has(i.titel)} onClick={() => void uebernehmen(i.titel, i.idee).then(() => setGenommen(new Set([...genommen, i.titel])))}>
                {genommen.has(i.titel) ? t('planung.ideen.uebernommen') : t('planung.ideen.uebernehmen')}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** Titelvorschläge für eine Karte */
export function TitelVorschlaege({ karte, setze }: { karte: PlanungKarte; setze: (titel: string) => void }): React.JSX.Element {
  const t = useT()
  const a = useKiAuftrag('titel')
  return (
    <div className="details-block">
      <span className="row" style={{ marginTop: 0, alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="muted small">{t('planung.titel.label')}</span>
        <button className="btn small" disabled={a.laeuft} onClick={() => a.starte({ karte: karte.id })}>
          {a.ergebnis ? t('planung.titel.neu') : t('planung.titel.los')}
        </button>
      </span>
      {a.laeuft && <Fortschritt stand={a.stand} text={t('planung.schritt.titel')} />}
      {a.fehler && <p className="warn small">{a.fehler}</p>}
      {a.ergebnis?.titel.map((x) => (
        <button key={x.titel} className={`titel-vorschlag${x.titel === karte.titel ? ' on' : ''}`} title={x.warum} onClick={() => setze(x.titel)}>
          <span>{x.titel}</span>
          <span className="muted small">{x.warum}</span>
        </button>
      ))}
    </div>
  )
}

/** Namen fürs Video im Schnitt (aus MoinStudio v0.38.0): die KI liest das ganze Transkript und schlägt 5 Titel vor */
export function NamenVorschlaege({ projekt, name, ki, gewaehlt }: { projekt: string; name: string; ki: boolean; gewaehlt: () => void }): React.JSX.Element {
  const t = useT()
  const a = useKiAuftrag('titel')
  const [eingabe, setEingabe] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const wert = eingabe ?? name
  const umbenennen = (neu: string, titel: boolean): void => {
    setFehler(null)
    window.cs.schnittUmbenennen(projekt, neu, titel).then(
      () => {
        setEingabe(null)
        gewaehlt()
      },
      (e: unknown) => setFehler(fehlerText(e))
    )
  }
  return (
    <div className="details-block">
      <div className="row wrap" style={{ marginTop: 0, alignItems: 'center' }}>
        <label className="row" style={{ alignItems: 'center', marginTop: 0 }}>
          {t('schnitt.namen.label')}
          <input className="input" style={{ width: 320 }} maxLength={120} value={wert} onChange={(e) => setEingabe(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && wert.trim() && wert !== name && umbenennen(wert, false)} />
        </label>
        <button className="btn small" disabled={!wert.trim() || wert === name} onClick={() => umbenennen(wert, false)}>
          {t('schnitt.namen.umbenennen')}
        </button>
        {ki && (
          <button className="btn small" disabled={a.laeuft} onClick={() => a.starte({ projekt })}>
            {a.ergebnis ? t('schnitt.namen.neu') : t('schnitt.namen.los')}
          </button>
        )}
      </div>
      {a.laeuft && <Fortschritt stand={a.stand} text={t('planung.schritt.titel')} />}
      {(a.fehler || fehler) && <p className="warn small">{a.fehler || fehler}</p>}
      {a.ergebnis && <p className="muted small">{t('schnitt.namen.hinweis')}</p>}
      {a.ergebnis?.titel.map((x) => (
        <button key={x.titel} className={`titel-vorschlag${x.titel === name ? ' on' : ''}`} title={x.warum} onClick={() => umbenennen(x.titel, true)}>
          <span>{x.titel}</span>
          <span className="muted small">{x.warum}</span>
        </button>
      ))}
    </div>
  )
}

/** Wochenplan-Vorschlag im Kalender */
export function WochenPlaner({ karten, termin }: { karten: PlanungKarte[]; termin: (id: string, termin: string) => void }): React.JSX.Element {
  const { t, locale } = useI18n()
  const a = useKiAuftrag('woche')
  const [uebernommen, setUebernommen] = useState<Set<string>>(new Set())
  const titel = (id: string): string => karten.find((k) => k.id === id)?.titel ?? t('planung.woche.geloescht')
  const wann = (x: string): string => {
    const { tag, zeit } = teileTermin(x)
    return `${new Intl.DateTimeFormat(locale, { weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(`${tag}T12:00`))} ${zeit}`
  }
  const nimm = (id: string, x: string): void => {
    termin(id, x)
    setUebernommen((u) => new Set([...u, id]))
  }
  const offen = a.ergebnis?.woche.plan.filter((p) => !uebernommen.has(p.karte)) ?? []
  return (
    <section>
      <h3>{t('planung.woche.titel')}</h3>
      <p className="muted small">{t('planung.woche.hinweis')}</p>
      <button className="btn small" disabled={a.laeuft} onClick={() => a.starte()}>
        {a.ergebnis ? t('planung.woche.neu') : t('planung.woche.los')}
      </button>
      {a.laeuft && <Fortschritt stand={a.stand} text={t('planung.schritt.woche')} />}
      {a.fehler && <p className="warn small">{a.fehler}</p>}
      {a.ergebnis && (
        <div className="wochen-plan">
          {a.ergebnis.woche.plan.length === 0 && <p className="muted small">{t('planung.woche.leer')}</p>}
          {a.ergebnis.woche.plan.map((p) => (
            <div key={p.karte} className="plan-zeile">
              <span className="small">
                <strong>{wann(p.termin)}</strong> {titel(p.karte)}
              </span>
              <span className="muted small">{p.grund}</span>
              <button className="btn small" disabled={uebernommen.has(p.karte)} onClick={() => nimm(p.karte, p.termin)}>
                {uebernommen.has(p.karte) ? t('planung.woche.eingeplant') : t('planung.woche.einplanen')}
              </button>
            </div>
          ))}
          {offen.length > 1 && (
            <button className="btn small primary" onClick={() => offen.forEach((p) => nimm(p.karte, p.termin))}>
              {t('planung.woche.alle')}
            </button>
          )}
          {a.ergebnis.woche.aufnehmen.length > 0 && (
            <>
              <span className="small">
                <strong>{t('planung.woche.aufnehmen')}</strong>
              </span>
              {a.ergebnis.woche.aufnehmen.map((x) => (
                <span key={x.karte} className="small">
                  • {titel(x.karte)} <span className="muted">– {x.grund}</span>
                </span>
              ))}
            </>
          )}
          {a.ergebnis.woche.hinweis && <p className="muted small">{a.ergebnis.woche.hinweis}</p>}
        </div>
      )}
    </section>
  )
}
