import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JobCancelled, JobQueue, type JobContext } from '../../src/main/jobs/queue'
import { looksLikeGpuFailure } from '../../src/main/jobs/blender'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function until(cond: () => boolean, timeout = 4000): Promise<void> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > timeout) throw new Error('Zeitüberschreitung beim Warten')
    await sleep(10)
  }
}

let dir: string
const queues: JobQueue[] = []
function makeQueue(): JobQueue {
  const q = new JobQueue(dir)
  queues.push(q)
  return q
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cs-jobs-'))
})
afterEach(async () => {
  for (const q of queues.splice(0)) q.dispose()
  await rm(dir, { recursive: true, force: true })
})

/** Handler mit `steps` Schritten, Pausenpunkt vor jedem Schritt, Checkpoint danach. */
function stepper(steps: number, delay = 20, log: string[] = []) {
  return async (payload: { name: string }, ctx: JobContext<{ done: number }>) => {
    for (let i = ctx.checkpoint?.done ?? 0; i < steps; i++) {
      await ctx.yield()
      await sleep(delay)
      log.push(`${payload.name}:${i}`)
      ctx.progress(Math.round(((i + 1) / steps) * 100), `Schritt ${i + 1}`)
      await ctx.save({ done: i + 1 })
    }
    return `${payload.name} fertig`
  }
}

describe('JobQueue', () => {
  it('arbeitet Jobs nacheinander ab und speichert das Ergebnis', async () => {
    const log: string[] = []
    const q = makeQueue()
    q.register('s', stepper(2, 5, log))
    await q.start()
    const a = await q.enqueue('s', 'A', { name: 'A' })
    const b = await q.enqueue('s', 'B', { name: 'B' })
    expect((await q.waitFor(b)).state).toBe('done')
    expect(log).toEqual(['A:0', 'A:1', 'B:0', 'B:1'])
    expect(q.result(a)).toBe('A fertig')
    expect(q.get(a)?.progress).toBe(100)
  })

  it('pausiert am nächsten Pausenpunkt und macht nach „Fortsetzen“ weiter', async () => {
    const log: string[] = []
    const q = makeQueue()
    q.register('s', stepper(6, 30, log))
    await q.start()
    const id = await q.enqueue('s', 'P', { name: 'P' })
    await until(() => log.length >= 2)
    await q.pause(id)
    expect(q.get(id)?.state).toBe('paused')
    const frozen = log.length
    await sleep(200)
    expect(log.length).toBeLessThanOrEqual(frozen + 1) // höchstens der gerade laufende Schritt
    await q.resume(id)
    expect((await q.waitFor(id)).state).toBe('done')
    expect(log).toHaveLength(6)
  })

  it('bricht ab und startet danach den nächsten Job', async () => {
    let sawCancel = false
    const q = makeQueue()
    q.register('long', async (_p, ctx) => {
      try {
        for (;;) {
          await ctx.yield()
          await sleep(10)
        }
      } catch (err) {
        sawCancel = err instanceof JobCancelled
        throw err
      }
    })
    q.register('s', stepper(1, 1))
    await q.start()
    const id = await q.enqueue('long', 'L', {})
    const next = await q.enqueue('s', 'N', { name: 'N' })
    await until(() => q.get(id)?.state === 'running')
    await q.cancel(id)
    expect((await q.waitFor(id)).state).toBe('cancelled')
    expect((await q.waitFor(next)).state).toBe('done')
    expect(sawCancel).toBe(true)
  })

  it('meldet Fehler mit Text', async () => {
    const q = makeQueue()
    q.register('boom', async () => {
      throw new Error('Blender fehlt')
    })
    await q.start()
    const id = await q.enqueue('boom', 'X', {})
    const info = await q.waitFor(id)
    expect(info.state).toBe('failed')
    expect(info.error).toBe('Blender fehlt')
  })

  it('setzt nach einem Neustart ab dem letzten Checkpoint fort', async () => {
    const first = makeQueue()
    let saved = false
    // Erster Durchlauf: nach 2 Schritten „stürzt die App ab“ (Handler hängt für immer)
    first.register('s', async (_p, ctx: JobContext<{ done: number }>) => {
      await ctx.save({ done: 2 })
      saved = true
      await new Promise(() => {})
    })
    await first.start()
    const id = await first.enqueue('s', 'R', { name: 'R' })
    await until(() => saved)

    const log: string[] = []
    const second = makeQueue()
    second.register('s', stepper(4, 1, log))
    await second.start()
    expect((await second.waitFor(id)).state).toBe('done')
    expect(log).toEqual(['R:2', 'R:3']) // Schritte 0 und 1 wurden nicht wiederholt
  })

  it('wartet bei Abo-Limit bis zum Zeitpunkt und macht dann selbst weiter', async () => {
    let calls = 0
    const q = makeQueue()
    q.register('claude', async (_p, ctx: JobContext<{ phase: string }>) => {
      calls++
      if (!ctx.checkpoint) {
        await ctx.save({ phase: 'teil1' })
        ctx.waitUntil(new Date(Date.now() + 150))
      }
      return `weiter ab ${ctx.checkpoint?.phase}`
    })
    await q.start()
    const id = await q.enqueue('claude', 'C', {})
    await until(() => q.get(id)?.state === 'waiting-limit')
    expect(q.get(id)?.resumeAt).toBeDefined()
    expect(q.get(id)?.step).toMatch(/KI-Limit|AI limit/)
    expect((await q.waitFor(id)).state).toBe('done')
    expect(calls).toBe(2)
    expect(q.result(id)).toBe('weiter ab teil1')
  })

  it('„Rechenlast pausieren“ hält alles an, „Fortsetzen“ macht weiter – auch nach Neustart', async () => {
    const log: string[] = []
    const q = makeQueue()
    q.register('s', stepper(3, 20, log))
    await q.start()
    await q.pauseAll()
    const id = await q.enqueue('s', 'G', { name: 'G' })
    await sleep(100)
    expect(log).toEqual([])
    expect(q.state().paused).toBe(true)

    const restarted = makeQueue()
    restarted.register('s', stepper(3, 5, log))
    await restarted.start()
    expect(restarted.state().paused).toBe(true)
    await restarted.resumeAll()
    expect((await restarted.waitFor(id)).state).toBe('done')
  })

  it('hält angemeldete Kindprozesse bei Pause wirklich an (NtSuspendProcess)', async () => {
    let ticks = 0
    const q = makeQueue()
    q.register('proc', async (_p, ctx) => {
      const child = spawn(process.execPath, ['-e', 'let i=0;setInterval(()=>{console.log(i++);if(i>=150)process.exit(0)},20)'])
      child.stdout.on('data', (d: Buffer) => (ticks += d.toString().trim().split(/\s+/).length))
      ctx.track(child)
      await new Promise((r) => child.once('exit', r))
    })
    await q.start()
    const id = await q.enqueue('proc', 'Prozess', {})
    await until(() => ticks > 5, 40_000) // unter Last startet node langsamer
    await q.pause(id)
    await sleep(60)
    const frozen = ticks
    await sleep(400)
    expect(ticks - frozen).toBeLessThanOrEqual(2)
    await q.resume(id)
    await until(() => ticks > frozen + 5, 40_000)
    expect((await q.waitFor(id)).state).toBe('done')
  }, 120_000)
})

describe('Blender-Start: Rückfall auf Software-OpenGL', () => {
  it('erkennt einen Grafik-Absturz (kein Python-Fehler) – echter Fall: Exit 0x80070057 nach RDP-Hardware-Test', () => {
    expect(looksLikeGpuFailure(2147942487, 'Blender 4.5.9 LTS (hash …)\n')).toBe(true)
    expect(looksLikeGpuFailure(1, 'Traceback (most recent call last):\n  …')).toBe(false)
    expect(looksLikeGpuFailure(0, '')).toBe(false)
    expect(looksLikeGpuFailure(null, '')).toBe(false)
  })
})
