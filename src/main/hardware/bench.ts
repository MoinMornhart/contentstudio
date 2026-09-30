import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { runHidden } from '../tools/smoke'
import { blenderEnv } from './mesa'
import type { BlenderEngine, CyclesDevice, EncoderBench, FailReason, RenderBench } from '@shared/hardware'

export type { BlenderEngine, CyclesDevice, EncoderBench, FailReason, RenderBench } from '@shared/hardware'

export interface DeviceList {
  ok: boolean
  version?: string
  gpu: Partial<Record<CyclesDevice, string[]>>
  reason?: FailReason
  detail?: string
}

/** Windows-Statuscodes abgestürzter Prozesse (als vorzeichenlose Exit-Codes). */
const STATUS_ILLEGAL_INSTRUCTION = 0xc000001d
const STATUS_ACCESS_VIOLATION = 0xc0000005

export function classifyExit(code: number | null, output: string): FailReason {
  if (code === null) return 'timeout'
  const unsigned = code >>> 0
  if (unsigned === STATUS_ILLEGAL_INSTRUCTION || /illegal[_ ]instruction/i.test(output)) return 'illegal-instruction'
  if (unsigned === STATUS_ACCESS_VIOLATION || /EXCEPTION_ACCESS_VIOLATION|segmentation/i.test(output)) return 'crash'
  return code === 0 ? 'error' : 'crash'
}

/** Bildhelligkeit unter diesem Wert gilt als schwarzes (kaputtes) Render. */
export const BLACK_THRESHOLD = 0.02

export class BlenderBench {
  constructor(
    private readonly script: string,
    private readonly workDir: string
  ) {}

  private async run(exe: string, args: string[], name: string, timeoutMs: number, env?: NodeJS.ProcessEnv): Promise<{ json: Record<string, unknown> | null; code: number | null; output: string }> {
    await mkdir(this.workDir, { recursive: true })
    const out = join(this.workDir, `${name}.json`)
    await rm(out, { force: true })
    const r = await runHidden(exe, ['-b', '--factory-startup', '--python', this.script, '--', args[0]!, out, ...args.slice(1)], timeoutMs, env)
    let json: Record<string, unknown> | null
    try {
      json = JSON.parse(await readFile(out, 'utf8')) as Record<string, unknown>
    } catch {
      json = null
    }
    return { json, code: r.code, output: `${r.stdout}\n${r.stderr}` }
  }

  async devices(exe: string): Promise<DeviceList> {
    const { json, code, output } = await this.run(exe, ['devices'], 'devices', 90_000)
    if (json?.['ok'] === true) {
      return { ok: true, version: String(json['version']), gpu: (json['gpu'] ?? {}) as DeviceList['gpu'] }
    }
    return { ok: false, gpu: {}, reason: json ? 'error' : classifyExit(code, output), detail: String(json?.['error'] ?? lastLines(output)) }
  }

  async render(exe: string, blender: string, engine: BlenderEngine, device: CyclesDevice, mesa: boolean, timeoutMs = 180_000): Promise<RenderBench> {
    const name = `${blender}-${engine}-${device}${mesa ? '-mesa' : ''}`
    const image = join(this.workDir, `${name}.png`)
    const { json, code, output } = await this.run(exe, ['render', engine, device, '480', '270', image], name, timeoutMs, blenderEnv(mesa))
    const base = { blender, engine, device, mesa }
    if (json?.['ok'] === true) {
      const brightness = Number(json['brightness'])
      if (!(brightness >= BLACK_THRESHOLD)) {
        return { ...base, ok: false, seconds: null, reason: 'black-image', detail: `Helligkeit ${brightness}` }
      }
      return { ...base, ok: true, seconds: Number(json['seconds']) }
    }
    return {
      ...base,
      ok: false,
      seconds: null,
      reason: json ? 'error' : classifyExit(code, output),
      detail: String(json?.['error'] ?? lastLines(output))
    }
  }
}

function lastLines(text: string): string {
  return text.trim().split(/\r?\n/).filter(Boolean).slice(-2).join(' | ').slice(0, 300)
}

/** Encoder in Vorzugsreihenfolge: Hardware zuerst, x264 als Rückfall, der überall läuft. */
export const ENCODERS = ['h264_nvenc', 'h264_amf', 'h264_qsv', 'libx264'] as const

/** Kodiert 3 s Testbild (1280×720) und misst die Geschwindigkeit. */
export async function benchEncoder(ffmpeg: string, encoder: string): Promise<EncoderBench> {
  const seconds = 3
  const r = await runHidden(
    ffmpeg,
    ['-hide_banner', '-nostdin', '-f', 'lavfi', '-i', `testsrc2=size=1280x720:rate=30:duration=${seconds}`, '-c:v', encoder, '-f', 'null', '-'],
    60_000
  )
  if (r.code !== 0) return { encoder, ok: false, fps: null }
  return { encoder, ok: true, fps: parseFfmpegFps(r.stderr) ?? Math.round(((seconds * 30) / Math.max(r.ms / 1000, 0.001)) * 10) / 10 }
}

/** Letzte „fps=“-Angabe aus FFmpegs Fortschrittsausgabe (ohne Programmstart-Zeit). */
export function parseFfmpegFps(stderr: string): number | null {
  const all = [...stderr.matchAll(/fps=\s*([\d.]+)/g)]
  const last = all.at(-1)
  const fps = last ? Number(last[1]) : NaN
  return Number.isFinite(fps) && fps > 0 ? fps : null
}
