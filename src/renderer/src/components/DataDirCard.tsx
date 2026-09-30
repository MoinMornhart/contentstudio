// Herkunft: MoinStudio src/renderer/src/components/DataDirCard.tsx (MIT).
import { useEffect, useState } from 'react'
import type { DataDirStatus } from '@shared/app'
import { Card } from './Panel'
import { useT } from '../i18n'

/** Datenordner wählen/öffnen und Konfliktkopien der Sync-Dienste anzeigen. */
export function DataDirCard(): React.JSX.Element {
  const t = useT()
  const [status, setStatus] = useState<DataDirStatus | null>(null)
  useEffect(() => {
    void window.cs.dataStatus().then(setStatus)
  }, [])

  const choose = async (): Promise<void> => {
    const next = await window.cs.chooseDataDir()
    if (next) setStatus(next)
  }

  return (
    <Card title={t('daten.titel')} badge={status?.conflicts.length ? t('daten.konflikte', { anzahl: status.conflicts.length }) : undefined}>
      {!status ? (
        <p className="muted">{t('app.laden')}</p>
      ) : !status.dataDir ? (
        <p className="muted">{t('daten.keiner')}</p>
      ) : (
        <>
          <p className="path">{status.dataDir}</p>
          {!status.available && <p className="warn">{t('daten.fehlt')}</p>}
          {status.conflicts.length > 0 && (
            <div className="warn">
              {t('daten.konfliktText')}
              <ul>
                {status.conflicts.map((c) => (
                  <li key={c.copy}>
                    <code>{c.copy}</code> ↔ <code>{c.original}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      <div className="row">
        <button className="btn primary" onClick={() => void choose()}>
          {status?.dataDir ? t('daten.anderer') : t('daten.waehlen')}
        </button>
        {status?.dataDir && status.available && (
          <button className="btn" onClick={() => void window.cs.openDataDir()}>
            {t('daten.oeffnen')}
          </button>
        )}
      </div>
    </Card>
  )
}
