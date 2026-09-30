// Herkunft: MoinStudio src/renderer/src/components/ToolsCard.tsx (MIT).
import { useEffect, useState } from 'react'
import type { ToolId, ToolProgressEvent, ToolStatus } from '@shared/app'
import { Card } from './Panel'
import { useT } from '../i18n'

function mb(bytes: number): string {
  return `${Math.round(bytes / 1e6)} MB`
}

/** Status der Werkzeuge (FFmpeg, uv, Blender) mit Installation per Knopf und Fortschritt. */
export function ToolsCard(): React.JSX.Element {
  const t = useT()
  const [tools, setTools] = useState<ToolStatus[] | null>(null)
  const [progress, setProgress] = useState<Partial<Record<ToolId, ToolProgressEvent>>>({})

  useEffect(() => {
    void window.cs.toolsStatus().then(setTools)
    return window.cs.onToolProgress((p) => setProgress((prev) => ({ ...prev, [p.id]: p })))
  }, [])

  const install = async (id: ToolId): Promise<void> => {
    setTools(await window.cs.installTool(id))
  }

  return (
    <Card title={t('werkzeuge.titel')}>
      {!tools ? (
        <p className="muted">{t('app.laden')}</p>
      ) : (
        <ul className="tool-list">
          {tools.map((tool) => {
            const p = progress[tool.id]
            const busy = p && p.phase !== 'done' && p.phase !== 'error'
            return (
              <li key={`${tool.id}@${tool.version}`}>
                <div className="tool-head">
                  <span className={tool.installed ? 'dot ok' : 'dot'} aria-hidden="true" />
                  <b>{tool.label}</b>
                  <span className="muted">{tool.installed ? t('werkzeuge.installiert') : t('werkzeuge.nichtInstalliert', { groesse: mb(tool.sizeBytes) })}</span>
                  {!tool.installed && !busy && (
                    <button className="btn small" onClick={() => void install(tool.id)}>
                      {t('werkzeuge.installieren')}
                    </button>
                  )}
                </div>
                {busy && (
                  <div className="tool-progress">
                    <span>
                      {t(`werkzeuge.phase.${p.phase}`)}
                      {p.percent !== null && p.phase === 'download' ? ` ${p.percent} %` : ''}
                    </span>
                    <progress max={100} value={p.phase === 'download' ? (p.percent ?? undefined) : undefined} />
                  </div>
                )}
                {p?.phase === 'error' && <p className="warn">{p.message}</p>}
              </li>
            )
          })}
        </ul>
      )}
      <p className="muted small">{t('werkzeuge.hinweis')}</p>
    </Card>
  )
}
