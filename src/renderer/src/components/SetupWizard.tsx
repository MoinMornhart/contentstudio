// Herkunft: MoinStudio src/renderer/src/components/SetupWizard.tsx (MIT), erweitert auf 12 Schritte mit Creator-Profil
// (ROADMAP M2). Jeder Schritt ist überspringbar; Übersprungenes wird im passenden Moment nachgefragt.
import { useEffect, useState } from 'react'
import type { Schluessel } from '@shared/i18n'
import { DataDirCard } from './DataDirCard'
import { SpracheWahl } from '../tabs/EinstellungenTab'
import { PersonSchritt, KontenSchritt } from '../profil/SchrittKonten'
import { DarstellungSchritt } from '../profil/SchrittDarstellung'
import { MarkeSchritt, VorbilderSchritt } from '../profil/SchrittMarke'
import { HardwareSchritt, KiSchritt, ProgrammeSchritt, WerkzeugeSchritt, Zusammenfassung } from '../profil/SchrittRest'
import { useProfil } from '../profil/useProfil'
import { useT } from '../i18n'

interface Schritt {
  id: string
  titel: Schluessel
  /** false: Schritt lässt sich nicht überspringen (Willkommen, Zusammenfassung) */
  ueberspringbar: boolean
  inhalt: () => React.JSX.Element | null
}

function Willkommen(): React.JSX.Element {
  const t = useT()
  return (
    <div className="setup-text">
      <h2>{t('setup.willkommen.titel')}</h2>
      <p>{t('setup.willkommen.text')}</p>
      <div className="feld">
        <span>{t('einst.sprache')}</span>
        <SpracheWahl />
      </div>
      <p className="muted">{t('setup.willkommen.ueberspringen')}</p>
    </div>
  )
}

export const SCHRITTE: Schritt[] = [
  { id: 'willkommen', titel: 'assi.schritt.willkommen', ueberspringbar: false, inhalt: Willkommen },
  { id: 'datenordner', titel: 'assi.schritt.datenordner', ueberspringbar: true, inhalt: DataDirCard },
  { id: 'person', titel: 'assi.schritt.person', ueberspringbar: true, inhalt: PersonSchritt },
  { id: 'konten', titel: 'assi.schritt.konten', ueberspringbar: true, inhalt: KontenSchritt },
  { id: 'darstellung', titel: 'assi.schritt.darstellung', ueberspringbar: true, inhalt: DarstellungSchritt },
  { id: 'vorbilder', titel: 'assi.schritt.vorbilder', ueberspringbar: true, inhalt: VorbilderSchritt },
  { id: 'marke', titel: 'assi.schritt.marke', ueberspringbar: true, inhalt: MarkeSchritt },
  { id: 'ki', titel: 'assi.schritt.ki', ueberspringbar: true, inhalt: KiSchritt },
  { id: 'programme', titel: 'assi.schritt.programme', ueberspringbar: true, inhalt: ProgrammeSchritt },
  { id: 'hardware', titel: 'assi.schritt.hardware', ueberspringbar: true, inhalt: HardwareSchritt },
  { id: 'werkzeuge', titel: 'assi.schritt.werkzeuge', ueberspringbar: true, inhalt: WerkzeugeSchritt },
  { id: 'fertig', titel: 'assi.schritt.fertig', ueberspringbar: false, inhalt: Zusammenfassung }
]

/** Einrichtungsassistent beim ersten Start (liegt über der ganzen App). */
export function SetupWizard({ onDone }: { onDone: () => void }): React.JSX.Element {
  const t = useT()
  const { profil, offen, status, fehler } = useProfil()
  const [nr, setNr] = useState(0)
  useEffect(() => window.cs.onSetupStep(setNr), [])
  const schritt = SCHRITTE[nr]!
  const letzter = nr === SCHRITTE.length - 1
  const Inhalt = schritt.inhalt
  const weiter = (uebersprungen: boolean): void => {
    if (schritt.ueberspringbar) offen(schritt.id, uebersprungen)
    setNr(nr + 1)
  }
  const fertig = async (): Promise<void> => {
    await window.cs.setupComplete(true)
    onDone()
  }
  return (
    <div className="setup-overlay" role="dialog" aria-modal="true" aria-label={t('setup.titel')}>
      <div className="setup-panel">
        <ol className="setup-steps">
          {SCHRITTE.map((s, i) => {
            const uebersprungen = profil?.offen.includes(s.id)
            return (
              <li key={s.id} className={i === nr ? 'active' : i < nr ? (uebersprungen ? 'skipped' : 'done') : ''} title={uebersprungen ? t('assi.uebersprungen') : undefined}>
                <button type="button" className="step-link" onClick={() => setNr(i)}>
                  <span className="num">{i < nr && !uebersprungen ? '✓' : i + 1}</span>
                  {t(s.titel)}
                </button>
              </li>
            )
          })}
        </ol>
        <div className="setup-body">
          {fehler && <p className="warn">{t('profil.fehlerLaden', { text: fehler })}</p>}
          <Inhalt />
        </div>
        <div className="setup-nav">
          <button className="btn" disabled={nr === 0} onClick={() => setNr(nr - 1)}>
            {t('setup.zurueck')}
          </button>
          <span className="muted small">
            {t('setup.schrittVon', { nr: nr + 1, gesamt: SCHRITTE.length })}
            {status === 'speichert' ? ` · ${t('profil.speichert')}` : status === 'gespeichert' ? ` · ${t('profil.gespeichert')}` : ''}
          </span>
          <span className="row" style={{ marginTop: 0 }}>
            {schritt.ueberspringbar && (
              <button className="btn" onClick={() => weiter(true)}>
                {t('assi.ueberspringen')}
              </button>
            )}
            {letzter ? (
              <button className="btn primary" onClick={() => void fertig()}>
                {t('setup.starten')}
              </button>
            ) : (
              <button className="btn primary" onClick={() => weiter(false)}>
                {nr === 0 ? t('setup.los') : t('setup.weiter')}
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  )
}
