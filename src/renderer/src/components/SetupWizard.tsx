// Herkunft: MoinStudio src/renderer/src/components/SetupWizard.tsx (MIT). Fundament-Fassung; die vollständigen
// 12 Schritte mit Creator-Profil folgen in ROADMAP M2.
import { useEffect, useState } from 'react'
import type { Schluessel } from '@shared/i18n'
import { DataDirCard } from './DataDirCard'
import { HardwareCard, useHardwareState } from './HardwareCard'
import { ToolsCard } from './ToolsCard'
import { SpracheWahl } from '../tabs/EinstellungenTab'
import { useT } from '../i18n'

const STEPS: Schluessel[] = ['setup.schritt.willkommen', 'setup.schritt.datenordner', 'setup.schritt.werkzeuge', 'setup.schritt.fertig']

function Welcome(): React.JSX.Element {
  const t = useT()
  return (
    <div className="setup-text">
      <h2>{t('setup.willkommen.titel')}</h2>
      <p>{t('setup.willkommen.text')}</p>
      <label className="feld">
        <span>{t('einst.sprache')}</span>
        <SpracheWahl />
      </label>
      <p className="muted">{t('setup.willkommen.ueberspringen')}</p>
    </div>
  )
}

function ToolsStep(): React.JSX.Element {
  const t = useT()
  const hw = useHardwareState()
  const [starting, setStarting] = useState(false)
  const running = hw?.state === 'running'
  const start = async (): Promise<void> => {
    setStarting(true)
    try {
      await window.cs.installTool('uv')
      await window.cs.runHardwareTest()
    } finally {
      setStarting(false)
    }
  }
  return (
    <>
      <div className="setup-text">
        <p>{t('setup.werkzeuge.text')}</p>
        {hw?.state !== 'done' && (
          <button className="btn primary" disabled={running || starting} onClick={() => void start()}>
            {running || starting ? t('setup.werkzeuge.laeuft') : t('setup.werkzeuge.start')}
          </button>
        )}
      </div>
      <div className="grid">
        <HardwareCard />
        <ToolsCard />
      </div>
    </>
  )
}

function Done(): React.JSX.Element {
  const t = useT()
  return (
    <div className="setup-text">
      <h2>{t('setup.fertig.titel')}</h2>
      <p>{t('setup.fertig.gutZuWissen')}</p>
      <ul>
        <li>{t('setup.fertig.updates')}</li>
        <li>{t('setup.fertig.smartscreen')}</li>
        <li>{t('setup.fertig.rechenlast')}</li>
      </ul>
    </div>
  )
}

/** Einrichtungsassistent beim ersten Start (liegt über der ganzen App). */
export function SetupWizard({ onDone }: { onDone: () => void }): React.JSX.Element {
  const t = useT()
  const [step, setStep] = useState(0)
  useEffect(() => window.cs.onSetupStep(setStep), [])
  const last = step === STEPS.length - 1
  const finish = async (): Promise<void> => {
    await window.cs.setupComplete(true)
    onDone()
  }
  return (
    <div className="setup-overlay" role="dialog" aria-modal="true" aria-label={t('setup.titel')}>
      <div className="setup-panel">
        <ol className="setup-steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? 'active' : i < step ? 'done' : ''}>
              <span className="num">{i < step ? '✓' : i + 1}</span>
              {t(s)}
            </li>
          ))}
        </ol>
        <div className="setup-body">
          {step === 0 && <Welcome />}
          {step === 1 && <DataDirCard />}
          {step === 2 && <ToolsStep />}
          {step === 3 && <Done />}
        </div>
        <div className="setup-nav">
          <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>
            {t('setup.zurueck')}
          </button>
          <span className="muted small">{t('setup.schrittVon', { nr: step + 1, gesamt: STEPS.length })}</span>
          {last ? (
            <button className="btn primary" onClick={() => void finish()}>
              {t('setup.starten')}
            </button>
          ) : (
            <button className="btn primary" onClick={() => setStep(step + 1)}>
              {step === 0 ? t('setup.los') : t('setup.weiter')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
