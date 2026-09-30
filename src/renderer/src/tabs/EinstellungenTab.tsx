// Herkunft: MoinStudio src/renderer/src/tabs/EinstellungenTab.tsx (MIT).
import { useEffect, useState } from 'react'
import type { AppInfo, AutostartState, UpdateStatus } from '@shared/app'
import { SPRACHEN, type Sprache } from '@shared/i18n'
import { useUpdateStatus } from '../components/UpdateBanner'
import { Card, PageHeader } from '../components/Panel'
import { DataDirCard } from '../components/DataDirCard'
import { ToolsCard } from '../components/ToolsCard'
import { HardwareCard } from '../components/HardwareCard'
import { UploadCard } from '../components/UploadCard'
import { ProgrammeCard } from '../components/ProgrammeCard'
import { useI18n, useT } from '../i18n'
import { ProfilKarte } from '../profil/ProfilKarte'

function AutostartSwitch(): React.JSX.Element {
  const t = useT()
  const [state, setState] = useState<AutostartState | null>(null)
  useEffect(() => {
    void window.cs.getAutostart().then(setState)
  }, [])
  if (!state) return <p className="muted">{t('app.laden')}</p>
  return (
    <label className={state.available ? 'switch' : 'switch disabled'}>
      <input type="checkbox" checked={state.enabled} disabled={!state.available} onChange={(e) => void window.cs.setAutostart(e.target.checked).then(setState)} />
      <span>{t('einst.autostart')}</span>
      {!state.available && <small className="muted">{t('einst.autostartNurInstalliert')}</small>}
    </label>
  )
}

/** Sprache der Oberfläche: wie Windows oder fest gewählt */
export function SpracheWahl(): React.JSX.Element {
  const { t, stand, setzeSprache } = useI18n()
  const wert = stand?.gewaehlt ?? 'system'
  return (
    <select className="input" aria-label={t('einst.sprache')} value={wert} onChange={(e) => void setzeSprache(e.target.value === 'system' ? null : (e.target.value as Sprache))}>
      <option value="system">{t('einst.spracheSystem', { sprache: t(`sprache.${stand?.system ?? 'de'}`) })}</option>
      {SPRACHEN.map((s) => (
        <option key={s} value={s}>
          {t(`sprache.${s}`)}
        </option>
      ))}
    </select>
  )
}

function UpdateCard(): React.JSX.Element {
  const t = useT()
  const live = useUpdateStatus()
  const [checked, setChecked] = useState<UpdateStatus | null>(null)
  const status = live.state === 'idle' && checked ? checked : live
  const text = ((): string => {
    switch (status.state) {
      case 'dev':
        return t('update.dev')
      case 'idle':
        return t('update.idle')
      case 'checking':
        return t('update.sucht')
      case 'none':
        return t('update.aktuell', { version: status.version })
      case 'available':
        return t('update.verfuegbar', { version: status.version })
      case 'downloading':
        return t('update.laedt', { version: status.version, prozent: status.percent })
      case 'ready':
        return t('update.bereitInstallation', { version: status.version })
      case 'error':
        return t('app.fehler', { text: status.message })
    }
  })()
  return (
    <Card title={t('update.titel')}>
      <p className="muted">{text}</p>
      <div className="row">
        <button className="btn" disabled={status.state === 'checking' || status.state === 'downloading'} onClick={() => void window.cs.checkForUpdate().then(setChecked)}>
          {t('update.suchen')}
        </button>
        {status.state === 'available' && (
          <button className="btn primary" onClick={() => void window.cs.downloadUpdate()}>
            {t('update.herunterladen')}
          </button>
        )}
        {status.state === 'ready' && (
          <button className="btn primary" onClick={() => void window.cs.installUpdate()}>
            {t('update.neustarten')}
          </button>
        )}
      </div>
    </Card>
  )
}

export function EinstellungenTab({ info }: { info: AppInfo | null }): React.JSX.Element {
  const t = useT()
  return (
    <>
      <PageHeader title={t('tab.einstellungen')} subtitle={t('einst.untertitel')} />
      <ProfilKarte />
      <div className="grid">
        <DataDirCard />
        <Card title={t('einst.sprache')}>
          <SpracheWahl />
          <p className="muted small">{t('einst.spracheHinweis')}</p>
        </Card>
        <HardwareCard />
        <ToolsCard />
        <Card title={t('einst.ueber')}>
          {info ? (
            <dl className="facts">
              <dt>{t('einst.version')}</dt>
              <dd>{info.version}</dd>
              <dt>{t('einst.system')}</dt>
              <dd>
                {info.platform} / {info.arch}
              </dd>
              <dt>Electron</dt>
              <dd>{info.electron}</dd>
              <dt>Chromium</dt>
              <dd>{info.chrome}</dd>
              <dt>Node</dt>
              <dd>{info.node}</dd>
            </dl>
          ) : (
            <p className="muted">{t('app.laden')}</p>
          )}
          <div className="row">
            <button className="btn" onClick={() => void window.cs.openLogs()}>
              {t('einst.protokolle')}
            </button>
            <button className="btn" onClick={() => void window.cs.setupComplete(false).then(() => window.location.reload())}>
              {t('einst.einrichtungNeu')}
            </button>
          </div>
        </Card>
        <ProgrammeCard />
        <UploadCard />
        <UpdateCard />
        <Card title={t('einst.start')}>
          <AutostartSwitch />
        </Card>
      </div>
    </>
  )
}
