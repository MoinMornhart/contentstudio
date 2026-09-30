// Herkunft: MoinStudio src/renderer/src/components/JobsWidget.tsx (MIT).
import { useEffect, useState } from 'react'
import type { JobInfo, QueueState } from '@shared/jobs'
import { useT } from '../i18n'

export function useJobs(): QueueState | null {
  const [state, setState] = useState<QueueState | null>(null)
  useEffect(() => {
    void window.cs.jobsState().then(setState)
    return window.cs.onJobsState(setState)
  }, [])
  return state
}

const ACTIVE = new Set<JobInfo['state']>(['queued', 'running', 'paused', 'waiting-limit'])

/** Kompakte Aufgabenliste in der Seitenleiste mit Pause/Fortsetzen/Abbrechen. */
export function JobsWidget(): React.JSX.Element | null {
  const t = useT()
  const state = useJobs()
  if (!state) return null
  const active = state.jobs.filter((j) => ACTIVE.has(j.state))
  return (
    <div className="jobs-widget">
      <div className="jobs-head">
        <span>{active.length ? t('jobs.titelAnzahl', { anzahl: active.length }) : t('jobs.titel')}</span>
        <button
          className={state.paused ? 'btn small primary' : 'btn small'}
          title={state.paused ? t('jobs.fortsetzenAlleHinweis') : t('jobs.pausierenAlleHinweis')}
          onClick={() => void window.cs.jobAction(state.paused ? 'resumeAll' : 'pauseAll')}
        >
          {state.paused ? t('jobs.fortsetzenAlle') : t('jobs.pausierenAlle')}
        </button>
      </div>
      {active.length === 0 ? (
        <p className="muted small">{t('jobs.keine')}</p>
      ) : (
        <ul className="jobs-list">
          {active.map((j) => (
            <li key={j.id} className={`job ${j.state}`}>
              <div className="job-title">{j.title}</div>
              <div className="job-step">{j.step}</div>
              {j.state === 'running' && <progress max={100} value={j.progress ?? undefined} />}
              <div className="job-actions">
                {j.state === 'running' && (
                  <button className="icon-btn" title={t('jobs.pausieren')} aria-label={t('jobs.pausieren')} onClick={() => void window.cs.jobAction('pause', j.id)}>
                    ⏸
                  </button>
                )}
                {j.state === 'paused' && (
                  <button className="icon-btn" title={t('jobs.fortsetzen')} aria-label={t('jobs.fortsetzen')} onClick={() => void window.cs.jobAction('resume', j.id)}>
                    ▶
                  </button>
                )}
                <button className="icon-btn" title={t('jobs.abbrechen')} aria-label={t('jobs.abbrechen')} onClick={() => void window.cs.jobAction('cancel', j.id)}>
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
