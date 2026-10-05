// Herkunft: MoinStudio src/renderer/src/App.tsx (MIT).
import { useEffect, useState } from 'react'
import { TABS, type AppInfo, type TabId } from '@shared/app'
import { ThumbnailTab } from './tabs/ThumbnailTab'
import { SchnittTab } from './tabs/SchnittTab'
import { PlanungTab } from './tabs/PlanungTab'
import { LogoTab } from './tabs/LogoTab'
import { EinstellungenTab } from './tabs/EinstellungenTab'
import { UpdateBanner } from './components/UpdateBanner'
import { HardwareBanner } from './components/HardwareCard'
import { JobsWidget } from './components/JobsWidget'
import { SetupWizard } from './components/SetupWizard'
import { NeueEffektePopup } from './schnitt/EffektBibliothek'
import { OEFFNE_EREIGNIS } from './navigation'
import { useT } from './i18n'

export function App(): React.JSX.Element {
  const t = useT()
  const [tab, setTab] = useState<TabId>('thumbnail')
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [setupDone, setSetupDone] = useState<boolean | null>(null)

  useEffect(() => {
    void window.cs.appInfo().then(setInfo)
    void window.cs.setupState().then(setSetupDone)
    // Sprung aus einem anderen Reiter (z. B. Planungskarte → Schnitt-Projekt)
    const sprung = (e: Event): void => setTab((e as CustomEvent<{ tab: TabId }>).detail.tab)
    window.addEventListener(OEFFNE_EREIGNIS, sprung)
    const aus = window.cs.onSelectTab(setTab)
    return () => {
      window.removeEventListener(OEFFNE_EREIGNIS, sprung)
      aus()
    }
  }, [])

  return (
    <div className="shell">
      {setupDone === false && <SetupWizard onDone={() => setSetupDone(true)} />}
      {setupDone !== false && <NeueEffektePopup />}
      <nav className="sidebar" aria-label={t('app.hauptnavigation')}>
        <div className="brand">
          <div className="brand-logo" aria-hidden="true" />
          <div className="brand-name">{t('app.name')}</div>
        </div>
        <ul className="tabs" role="tablist">
          {TABS.map((tb) => (
            <li key={tb.id}>
              <button role="tab" aria-selected={tab === tb.id} className={tab === tb.id ? 'tab active' : 'tab'} onClick={() => setTab(tb.id)}>
                <span className="tab-icon" aria-hidden="true">
                  {tb.icon}
                </span>
                {t(tb.label)}
              </button>
            </li>
          ))}
        </ul>
        <JobsWidget />
        <div className="sidebar-foot">{info ? `v${info.version}` : ''}</div>
      </nav>
      <main className="content" role="tabpanel">
        <UpdateBanner />
        <HardwareBanner />
        {tab === 'thumbnail' && <ThumbnailTab />}
        {tab === 'schnitt' && <SchnittTab />}
        {tab === 'planung' && <PlanungTab />}
        {tab === 'logo' && <LogoTab />}
        {tab === 'einstellungen' && <EinstellungenTab info={info} />}
      </main>
    </div>
  )
}
