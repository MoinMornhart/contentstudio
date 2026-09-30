import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { JobInfo, JobState, QueueState } from '@shared/jobs'
import { readJson, writeJsonAtomic } from '../data/jsonfile'
import { lowerPriority, resumeProcess, suspendProcess } from './suspend'
import { hauptSprache, t } from '../i18n'
import { gebietsschema } from '@shared/i18n'

/** Wird von `ctx.waitUntil()` geworfen: Job pausiert bis zum Zeitpunkt und startet dann neu. */
export class LimitWait extends Error {
  constructor(readonly resumeAt: Date) {
    super(`Wartet bis ${resumeAt.toISOString()}`)
  }
}

export class JobCancelled extends Error {
  constructor() {
    super(t('jobs.schritt.abgebrochen'))
  }
}

export interface JobContext<C = unknown> {
  readonly id: string
  /** Letzter gespeicherter Zwischenstand (nach Neustart oder Limit-Pause) */
  readonly checkpoint: C | undefined
  save(checkpoint: C): Promise<void>
  progress(percent: number | null, step: string): void
  /** Pausenpunkt zwischen Arbeitsschritten: wartet bei Pause, wirft bei Abbruch. */
  yield(): Promise<void>
  readonly signal: AbortSignal
  /** Kindprozess anmelden: niedrige Priorität, wird bei Pause hart angehalten. */
  track(child: ChildProcess): void
  /** Abo-Limit o. Ä.: Job wartet bis `resumeAt` und startet dann mit dem Checkpoint neu. */
  waitUntil(resumeAt: Date): never
}

export type JobHandler<P = unknown, C = unknown, R = unknown> = (payload: P, ctx: JobContext<C>) => Promise<R>

const RecordSchema = z
  .object({
    id: z.string(),
    kind: z.string(),
    title: z.string(),
    state: z.enum(['queued', 'running', 'paused', 'waiting-limit', 'done', 'failed', 'cancelled']),
    progress: z.number().nullable(),
    step: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    resumeAt: z.string().optional(),
    error: z.string().optional(),
    payload: z.unknown(),
    checkpoint: z.unknown().optional(),
    result: z.unknown().optional(),
    pausedByAll: z.boolean().optional()
  })
  .passthrough()
type JobRecord = z.infer<typeof RecordSchema>

const FINISHED: ReadonlySet<JobState> = new Set(['done', 'failed', 'cancelled'])
const KEEP_FINISHED = 50

interface Running {
  id: string
  abort: AbortController
  children: Set<ChildProcess>
  paused: boolean
  resumeWaiters: (() => void)[]
}

/**
 * Persistente Warteschlange: immer nur ein Job gleichzeitig (Rechenlast und Claude-Abo),
 * Zwischenstände überleben Neustarts, Pause wirkt kooperativ und – über angemeldete
 * Kindprozesse – auch hart.
 */
export class JobQueue extends EventEmitter {
  private jobs = new Map<string, JobRecord>()
  private handlers = new Map<string, JobHandler>()
  private paused = false
  private running: Running | null = null
  private timers = new Map<string, NodeJS.Timeout>()
  private loopActive = false
  private started = false

  constructor(private readonly dir: string) {
    super()
  }

  register<P, C, R>(kind: string, handler: JobHandler<P, C, R>): void {
    this.handlers.set(kind, handler as JobHandler)
  }

  /** Lädt gespeicherte Jobs; unterbrochene laufen ab ihrem Checkpoint weiter. */
  async start(): Promise<void> {
    const q = await readJson(join(this.dir, 'queue.json'), z.object({ paused: z.boolean() }))
    this.paused = q.ok ? q.value.paused : false
    let names: string[]
    try {
      names = (await readdir(this.dir)).filter((n) => n.endsWith('.job.json'))
    } catch {
      names = []
    }
    for (const name of names) {
      const res = await readJson(join(this.dir, name), RecordSchema)
      if (!res.ok) continue
      const job = res.value
      if (job.state === 'running') job.state = 'queued'
      this.jobs.set(job.id, job)
      if (job.state === 'waiting-limit' && job.resumeAt) this.armTimer(job)
    }
    this.started = true
    this.emitChange()
    void this.loop()
  }

  state(): QueueState {
    const jobs = [...this.jobs.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(toInfo)
    return { paused: this.paused, jobs }
  }

  get(id: string): JobInfo | undefined {
    const j = this.jobs.get(id)
    return j ? toInfo(j) : undefined
  }

  payload<P>(id: string): P | undefined {
    return this.jobs.get(id)?.payload as P | undefined
  }

  result<R>(id: string): R | undefined {
    return this.jobs.get(id)?.result as R | undefined
  }

  async enqueue<P>(kind: string, title: string, payload: P): Promise<string> {
    if (!this.handlers.has(kind)) throw new Error(t('jobs.fehler.unbekannteArt', { art: kind }))
    const now = new Date().toISOString()
    const id = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`
    const job: JobRecord = { id, kind, title, state: 'queued', progress: null, step: t('jobs.schritt.wartet'), createdAt: now, updatedAt: now, payload }
    this.jobs.set(id, job)
    await this.persist(job)
    this.emitChange()
    void this.loop()
    return id
  }

  /** Wartet, bis ein Job fertig, fehlgeschlagen oder abgebrochen ist. */
  waitFor(id: string): Promise<JobInfo> {
    return new Promise((resolve) => {
      const check = (): boolean => {
        const j = this.jobs.get(id)
        if (j && FINISHED.has(j.state)) {
          this.off('change', check)
          resolve(toInfo(j))
          return true
        }
        return false
      }
      if (!check()) this.on('change', check)
    })
  }

  async pause(id: string, byAll = false): Promise<void> {
    const job = this.jobs.get(id)
    if (!job || FINISHED.has(job.state) || job.state === 'paused') return
    job.pausedByAll = byAll
    if (this.running?.id === id) {
      this.running.paused = true
      for (const child of this.running.children) if (child.pid) await suspendProcess(child.pid)
    }
    await this.update(job, { state: 'paused', step: byAll ? t('jobs.schritt.pausiertAlle') : t('jobs.schritt.pausiert') })
  }

  async resume(id: string): Promise<void> {
    const job = this.jobs.get(id)
    if (!job || job.state !== 'paused') return
    job.pausedByAll = false
    if (this.running?.id === id) {
      for (const child of this.running.children) if (child.pid) await resumeProcess(child.pid)
      this.running.paused = false
      await this.update(job, { state: 'running', step: t('jobs.schritt.laeuftWeiter') })
      for (const wake of this.running.resumeWaiters.splice(0)) wake()
    } else {
      await this.update(job, { state: 'queued', step: t('jobs.schritt.wartet') })
      void this.loop()
    }
  }

  async cancel(id: string): Promise<void> {
    const job = this.jobs.get(id)
    if (!job || FINISHED.has(job.state)) return
    this.clearTimer(id)
    if (this.running?.id === id) {
      const r = this.running
      for (const child of r.children) {
        if (child.pid) await resumeProcess(child.pid)
        child.kill()
      }
      r.abort.abort()
      for (const wake of r.resumeWaiters.splice(0)) wake()
    }
    await this.update(job, { state: 'cancelled', step: t('jobs.schritt.abgebrochen') })
  }

  /** Job ganz entfernen („Aufträge löschen“): läuft er noch, wird er vorher abgebrochen. Gibt die Nutzlast zurück. */
  async remove(id: string): Promise<unknown> {
    const job = this.jobs.get(id)
    if (!job) return undefined
    if (!FINISHED.has(job.state)) await this.cancel(id)
    this.clearTimer(id)
    this.jobs.delete(id)
    await rm(join(this.dir, `${id}.job.json`), { force: true })
    this.emitChange()
    return job.payload
  }

  /** Knopf „Rechenlast pausieren“: hält den laufenden Job an und startet keine neuen. */
  async pauseAll(): Promise<void> {
    this.paused = true
    await writeJsonAtomic(join(this.dir, 'queue.json'), { paused: true })
    if (this.running) await this.pause(this.running.id, true)
    this.emitChange()
  }

  async resumeAll(): Promise<void> {
    this.paused = false
    await writeJsonAtomic(join(this.dir, 'queue.json'), { paused: false })
    for (const job of this.jobs.values()) if (job.state === 'paused' && job.pausedByAll) await this.resume(job.id)
    this.emitChange()
    void this.loop()
  }

  private async loop(): Promise<void> {
    if (this.loopActive || !this.started) return
    this.loopActive = true
    try {
      for (;;) {
        if (this.paused || this.running) return
        const next = [...this.jobs.values()]
          .filter((j) => j.state === 'queued')
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
        if (!next) return
        await this.run(next)
      }
    } finally {
      this.loopActive = false
    }
  }

  private async run(job: JobRecord): Promise<void> {
    const handler = this.handlers.get(job.kind)
    if (!handler) {
      await this.update(job, { state: 'failed', error: t('jobs.fehler.keineVerarbeitung', { art: job.kind }) })
      return
    }
    const r: Running = { id: job.id, abort: new AbortController(), children: new Set(), paused: false, resumeWaiters: [] }
    this.running = r
    await this.update(job, { state: 'running', step: t('jobs.schritt.startet'), error: undefined, resumeAt: undefined })

    const ctx: JobContext = {
      id: job.id,
      checkpoint: job.checkpoint,
      signal: r.abort.signal,
      save: async (checkpoint) => {
        job.checkpoint = checkpoint
        await this.persist(job)
      },
      progress: (percent, step) => {
        if (job.state !== 'running') return
        job.progress = percent
        job.step = step
        job.updatedAt = new Date().toISOString()
        this.emitChange()
      },
      yield: async () => {
        if (r.abort.signal.aborted) throw new JobCancelled()
        if (r.paused) await new Promise<void>((wake) => r.resumeWaiters.push(wake))
        if (r.abort.signal.aborted) throw new JobCancelled()
      },
      track: (child) => {
        r.children.add(child)
        if (child.pid) lowerPriority(child.pid)
        child.once('exit', () => r.children.delete(child))
        if (r.paused && child.pid) void suspendProcess(child.pid)
      },
      waitUntil: (resumeAt) => {
        throw new LimitWait(resumeAt)
      }
    }

    try {
      const result = await handler(job.payload, ctx)
      if (job.state !== 'cancelled') await this.update(job, { state: 'done', progress: 100, step: t('jobs.schritt.fertig'), result })
    } catch (err) {
      if (job.state === 'cancelled' || err instanceof JobCancelled) {
        if (job.state !== 'cancelled') await this.update(job, { state: 'cancelled', step: t('jobs.schritt.abgebrochen') })
      } else if (err instanceof LimitWait) {
        await this.update(job, {
          state: 'waiting-limit',
          resumeAt: err.resumeAt.toISOString(),
          step: t('jobs.schritt.limit', { zeit: err.resumeAt.toLocaleTimeString(gebietsschema(hauptSprache()), { hour: '2-digit', minute: '2-digit' }) })
        })
        this.armTimer(job)
      } else {
        await this.update(job, { state: 'failed', error: err instanceof Error ? err.message : String(err), step: t('jobs.schritt.fehlgeschlagen') })
      }
    } finally {
      this.running = null
      await this.prune()
      void this.loop()
    }
  }

  private armTimer(job: JobRecord): void {
    this.clearTimer(job.id)
    const ms = Math.max(0, new Date(job.resumeAt ?? 0).getTime() - Date.now())
    // setTimeout verträgt maximal ~24,8 Tage; Limits liegen weit darunter.
    const timer = setTimeout(() => {
      this.timers.delete(job.id)
      if (job.state !== 'waiting-limit') return
      void this.update(job, { state: 'queued', step: t('jobs.schritt.wartet'), resumeAt: undefined }).then(() => this.loop())
    }, Math.min(ms, 2 ** 31 - 1))
    timer.unref?.()
    this.timers.set(job.id, timer)
  }

  private clearTimer(id: string): void {
    const t = this.timers.get(id)
    if (t) clearTimeout(t)
    this.timers.delete(id)
  }

  /** Beendet Timer (für Tests und beim Beenden der App). */
  dispose(): void {
    for (const id of [...this.timers.keys()]) this.clearTimer(id)
  }

  private async update(job: JobRecord, patch: Partial<JobRecord>): Promise<void> {
    Object.assign(job, patch, { updatedAt: new Date().toISOString() })
    await this.persist(job)
    this.emitChange()
  }

  private async persist(job: JobRecord): Promise<void> {
    await writeJsonAtomic(join(this.dir, `${job.id}.job.json`), job)
  }

  private async prune(): Promise<void> {
    const finished = [...this.jobs.values()].filter((j) => FINISHED.has(j.state)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    for (const old of finished.slice(KEEP_FINISHED)) {
      this.jobs.delete(old.id)
      await rm(join(this.dir, `${old.id}.job.json`), { force: true })
    }
  }

  private emitChange(): void {
    this.emit('change', this.state())
  }
}

function toInfo(j: JobRecord): JobInfo {
  const info: JobInfo = {
    id: j.id,
    kind: j.kind,
    title: j.title,
    state: j.state,
    progress: j.progress,
    step: j.step,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt
  }
  if (j.resumeAt) info.resumeAt = j.resumeAt
  if (j.error) info.error = j.error
  return info
}
