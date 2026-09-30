// Herkunft: MoinStudio src/renderer/src/components/HardwareCard.tsx (MIT).
import { useEffect, useState } from 'react'
import type { HardwareState, OnnxProvider, RenderSetting } from '@shared/hardware'
import type { Schluessel } from '@shared/i18n'
import { Card } from './Panel'
import { useJobs } from './JobsWidget'
import { fehlerText, useI18n } from '../i18n'

export function useHardwareState(): HardwareState | null {
  const [state, setState] = useState<HardwareState | null>(null)
  useEffect(() => {
    void window.cs.hardwareState().then(setState)
    return window.cs.onHardwareState(setState)
  }, [])
  return state
}

const ENGINE_NAME: Record<RenderSetting['engine'], string> = { CYCLES: 'Cycles', EEVEE: 'EEVEE', WORKBENCH: 'Workbench' }
const ONNX_NAME: Record<OnnxProvider, string> = { cuda: 'CUDA', directml: 'DirectML', cpu: 'CPU' }

/** Startet die Aufgabe „Probebild“ und zeigt das Ergebnis, sobald sie fertig ist. */
/** Leistungsbericht (ROADMAP 8.4): misst Export und Spracherkennung und öffnet den Bericht */
function Leistungsbericht({ disabled }: { disabled: boolean }): React.JSX.Element {
  const { t } = useI18n()
  const [stand, setStand] = useState<{ percent: number; step: string } | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  useEffect(() => window.cs.onLeistungStand(setStand), [])
  const laeuft = !!stand && stand.percent < 100
  return (
    <>
      <button
        className="btn"
        disabled={disabled || laeuft}
        title={t('leistung.hinweis')}
        onClick={() => {
          setFehler(null)
          setStand({ percent: 0, step: t('leistung.schritt.start') })
          window.cs.leistungsbericht().then(
            () => setStand(null),
            (e: unknown) => {
              setStand(null)
              setFehler(fehlerText(e))
            }
          )
        }}
      >
        {laeuft ? `${stand.step} (${stand.percent} %)` : t('leistung.knopf')}
      </button>
      {fehler && <span className="warn small">{fehler}</span>}
    </>
  )
}

function ProbeRender({ disabled }: { disabled: boolean }): React.JSX.Element {
  const { t } = useI18n()
  const jobs = useJobs()
  const [jobId, setJobId] = useState<string | null>(null)
  const [image, setImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const job = jobs?.jobs.find((j) => j.id === jobId)
  useEffect(() => {
    if (job?.state === 'done') void window.cs.jobImage(job.id).then(setImage)
  }, [job?.state, job?.id])
  const start = async (): Promise<void> => {
    setImage(null)
    setError(null)
    try {
      setJobId(await window.cs.probeRender())
    } catch (err) {
      setError(fehlerText(err))
    }
  }
  const busy = job && (job.state === 'queued' || job.state === 'running' || job.state === 'paused')
  return (
    <>
      <button className="btn" disabled={disabled || !!busy} onClick={() => void start()}>
        {t('hw.probebild')}
      </button>
      {error && <p className="warn">{error}</p>}
      {job?.state === 'failed' && <p className="warn">{job.error}</p>}
      {image && <img className="probe-image" src={image} alt={t('hw.probebildAlt')} />}
    </>
  )
}

/** Ergebnis des Hardware-Tests mit Begründungen und Knopf „Neu testen“. */
export function HardwareCard(): React.JSX.Element {
  const { t, locale } = useI18n()
  const state = useHardwareState()
  const running = state?.state === 'running'
  const profile = state?.state === 'done' ? state.profile : state?.state === 'error' ? state.profile : null
  const c = profile ? { ...profile.config, ...profile.overrides } : null

  const renderText = (r: RenderSetting): string => {
    const where = r.engine === 'CYCLES' ? (r.device === 'CPU' ? t('hw.aufCpu') : t('hw.aufGpu', { geraet: r.device })) : ''
    return `${ENGINE_NAME[r.engine]}${where}, ${r.width}×${r.height}`
  }
  const duration = (s: number | null): string => (s === null ? '' : s < 90 ? t('hw.proBildSek', { sekunden: s }) : t('hw.proBildMin', { minuten: Math.round(s / 60) }))

  return (
    <Card title={t('hw.titel')} badge={state?.state === 'done' && state.outdated ? t('hw.neuEmpfohlen') : undefined}>
      {!state ? (
        <p className="muted">{t('app.laden')}</p>
      ) : running ? (
        <div className="tool-progress standalone">
          <span>{state.progress.step}</span>
          <progress max={100} value={state.progress.percent} />
        </div>
      ) : state.state === 'none' ? (
        <p className="muted">{t('hw.nichtGetestet')}</p>
      ) : null}

      {state?.state === 'error' && <p className="warn">{t('hw.fehlgeschlagen', { text: state.message })}</p>}

      {c && profile && !running && (
        <>
          <dl className="facts">
            <dt>{t('hw.grafik')}</dt>
            <dd>
              {profile.hardware.gpus
                .filter((g) => g.physical)
                .map((g) => `${g.name}${g.vramMB ? ` (${Math.round(g.vramMB / 1024)} GB)` : ''}`)
                .join(', ') || t('hw.keineGpu')}
            </dd>
            <dt>{t('hw.prozessor')}</dt>
            <dd>{t('hw.prozessorWert', { threads: profile.hardware.cpuThreads, ram: profile.hardware.ramGB })}</dd>
            <dt>{t('hw.blender')}</dt>
            <dd>
              {c.blenderVersion ?? (c.blenderUebersprungen ? t('hw.blenderNichtGeladen') : t('hw.blenderNicht'))}
              {c.blenderMesa ? t('hw.softwareGl') : ''}
            </dd>
            {c.blenderVersion && (
              <>
                <dt>{t('hw.vorschau')}</dt>
                <dd>{renderText(c.preview)}</dd>
                <dt>{t('hw.endbild')}</dt>
                <dd>
                  {renderText(c.final)}
                  {duration(c.finalSecondsEstimate)}
                </dd>
              </>
            )}
            <dt>{t('hw.video')}</dt>
            <dd>{c.encoder}</dd>
            <dt>{t('hw.whisper')}</dt>
            <dd>{t('hw.whisperWert', { modell: c.whisper.model, ort: c.whisper.device === 'cuda' ? t('hw.gpu') : t('hw.cpu') })}</dd>
            <dt>{t('hw.onnx')}</dt>
            <dd>{ONNX_NAME[c.onnx]}</dd>
            <dt>{t('hw.bildmodelle')}</dt>
            <dd>{t(`hw.bild.${c.imageModels}` as Schluessel)}</dd>
          </dl>
          {c.notes.length > 0 && (
            <ul className="notes">
              {c.notes.map((n) => (
                <li key={n.key}>{t(n.key, n.werte)}</li>
              ))}
            </ul>
          )}
          <p className="muted small">{t('hw.getestetAm', { datum: new Date(profile.createdAt).toLocaleString(locale), sekunden: profile.durationSeconds })}</p>
        </>
      )}

      <div className="row">
        <button className="btn" disabled={running} onClick={() => void window.cs.runHardwareTest()}>
          {state?.state === 'none' ? t('hw.jetztTesten') : t('hw.neuTesten')}
        </button>
        {profile && c?.blenderVersion && <ProbeRender disabled={running} />}
        {profile && <Leistungsbericht disabled={running} />}
      </div>
    </Card>
  )
}

/** Hinweisleiste oben, solange der Hardware-Test läuft. */
export function HardwareBanner(): React.JSX.Element | null {
  const { t } = useI18n()
  const state = useHardwareState()
  if (state?.state !== 'running') return null
  return (
    <div className="update-banner">
      <span>{t('hw.banner', { schritt: state.progress.step })}</span>
      <progress max={100} value={state.progress.percent} />
    </div>
  )
}
