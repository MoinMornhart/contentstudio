// Herkunft: MoinStudio src/renderer/src/components/UpdateBanner.tsx (MIT).
import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/app'
import { useT } from '../i18n'

/** Hinweisleiste oben, sobald eine neue Version verfügbar oder bereit zur Installation ist. */
export function UpdateBanner(): React.JSX.Element | null {
  const t = useT()
  const status = useUpdateStatus()
  if (status.state === 'available') {
    return (
      <div className="update-banner">
        <span>{t('update.neu', { version: status.version })}</span>
        <button className="btn primary small" onClick={() => void window.cs.downloadUpdate()}>
          {t('update.herunterladen')}
        </button>
      </div>
    )
  }
  if (status.state === 'downloading') {
    return (
      <div className="update-banner">
        <span>{t('update.laedt', { version: status.version, prozent: status.percent })}</span>
        <progress max={100} value={status.percent} />
      </div>
    )
  }
  if (status.state === 'ready') {
    return (
      <div className="update-banner">
        <span>{t('update.bereit', { version: status.version })}</span>
        <button className="btn primary small" onClick={() => void window.cs.installUpdate()}>
          {t('update.installieren')}
        </button>
      </div>
    )
  }
  return null
}

export function useUpdateStatus(): UpdateStatus {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  useEffect(() => window.cs.onUpdateStatus(setStatus), [])
  return status
}
