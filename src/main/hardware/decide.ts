// Herkunft: MoinStudio src/main/hardware/decide.ts (MIT), erweitert um ONNX-Anbieter, optionales Blender und
// übersetzbare Hinweise.
import type {
  CyclesDevice,
  DeviceConfig,
  EncoderBench,
  HardwareInfo,
  HardwareNotiz,
  ImageModelTier,
  OnnxProvider,
  RenderBench,
  WhisperChoice
} from '@shared/hardware'

export type { DeviceConfig, ImageModelTier, WhisperChoice } from '@shared/hardware'

const GPU_ORDER: CyclesDevice[] = ['OPTIX', 'CUDA', 'HIP', 'ONEAPI', 'METAL']
const ENCODER_ORDER = ['h264_nvenc', 'h264_amf', 'h264_qsv', 'libx264']

/** Test: 480×270 bei 16 Samples. Endbild: 1920×1080 → 16× Pixel. */
const PIXEL_FACTOR = (1920 * 1080) / (480 * 270)
/** Endbild darf auf diesem Gerät höchstens so lange dauern, sonst wird ein schnellerer Weg gewählt. */
const FINAL_BUDGET_SECONDS = 180

function best<T>(items: T[], score: (t: T) => number): T | undefined {
  return [...items].sort((a, b) => score(a) - score(b))[0]
}

/**
 * Legt die Konfiguration aus Hardware und Messwerten fest. `blenderGetestet = false` heißt: Blender wurde bewusst nicht
 * geladen (kein 3D im Profil) – das ist kein Fehler, 3D wird beim ersten Einsatz nachgeholt.
 */
export function decideConfig(hw: HardwareInfo, renders: RenderBench[], encoders: EncoderBench[], blenderGetestet = true): DeviceConfig {
  const notes: HardwareNotiz[] = []
  const ok = renders.filter((r) => r.ok && r.seconds !== null)

  // 1. Blender-Version: zuerst eine, auf der Cycles läuft (beste Qualität), dann die neueste
  const rank = (v: string): number => (ok.some((r) => r.blender === v && r.engine === 'CYCLES') ? 1 : 0)
  const versions = [...new Set(ok.map((r) => r.blender))].sort((a, b) => rank(b) - rank(a) || b.localeCompare(a, undefined, { numeric: true }))
  const blenderVersion = versions[0] ?? null
  const usable = ok.filter((r) => r.blender === blenderVersion)
  const crashedNewer = renders.some((r) => r.reason === 'illegal-instruction' && r.blender !== blenderVersion)
  if (crashedNewer && blenderVersion) notes.push({ key: 'hw.notiz.neueresBlender', werte: { version: blenderVersion } })
  if (!blenderGetestet) notes.push({ key: 'hw.notiz.blenderAus' })
  else if (!blenderVersion) notes.push({ key: 'hw.notiz.keinBlender' })

  const cyclesGpu = best(
    usable.filter((r) => r.engine === 'CYCLES' && r.device !== 'CPU'),
    (r) => GPU_ORDER.indexOf(r.device) * 1000 + (r.seconds ?? 0)
  )
  const cyclesCpu = usable.find((r) => r.engine === 'CYCLES' && r.device === 'CPU')
  const eevee = usable.find((r) => r.engine === 'EEVEE')
  const workbench = usable.find((r) => r.engine === 'WORKBENCH')
  const blenderMesa = usable.length > 0 && usable.every((r) => r.mesa || r.engine === 'CYCLES') && usable.some((r) => r.mesa)

  // 2. Endbild: Kandidaten in Qualitätsreihenfolge; der erste, der ins Zeitbudget passt, gewinnt.
  //    Passt keiner, wird der schnellste genommen (langsam, aber es funktioniert).
  const estimate = (r: RenderBench | undefined, samplesFactor: number): number | null =>
    r?.seconds != null ? Math.round(r.seconds * PIXEL_FACTOR * samplesFactor) : null
  interface Candidate {
    setting: DeviceConfig['final']
    est: number
    note: HardwareNotiz
  }
  const candidates: Candidate[] = []
  const add = (r: RenderBench | undefined, samples: number, note: HardwareNotiz): void => {
    const est = estimate(r, samples / 16)
    if (r && est !== null) candidates.push({ setting: { engine: r.engine, device: r.device, width: 1920, height: 1080, samples }, est, note })
  }
  add(cyclesGpu, 128, { key: 'hw.notiz.cyclesGpu', werte: { geraet: cyclesGpu?.device ?? '' } })
  add(cyclesCpu, 64, { key: 'hw.notiz.cyclesCpu' })
  add(eevee, 64, { key: eevee?.mesa ? 'hw.notiz.eeveeMesa' : 'hw.notiz.eevee' })
  add(cyclesCpu, 32, { key: 'hw.notiz.cyclesCpuWenig' })
  const chosen = candidates.find((c) => c.est <= FINAL_BUDGET_SECONDS) ?? best(candidates, (c) => c.est)
  let final: DeviceConfig['final']
  let finalSecondsEstimate: number | null
  if (chosen) {
    final = chosen.setting
    finalSecondsEstimate = chosen.est
    notes.push(chosen.note)
    if (chosen.est > FINAL_BUDGET_SECONDS) notes.push({ key: 'hw.notiz.langsam' })
  } else {
    final = { engine: 'WORKBENCH', device: 'CPU', width: 1920, height: 1080, samples: 1 }
    finalSecondsEstimate = null
    if (workbench) notes.push({ key: 'hw.notiz.nurWorkbench' })
  }

  // 3. Vorschau für die Prüfschleife: schnell, 960×540
  const previewCandidate = best(
    [workbench, eevee, cyclesGpu, cyclesCpu].filter((r): r is RenderBench => !!r),
    (r) => r.seconds ?? Infinity
  )
  const preview: DeviceConfig['preview'] = previewCandidate
    ? { engine: previewCandidate.engine, device: previewCandidate.device, width: 960, height: 540, samples: previewCandidate.engine === 'CYCLES' ? 8 : 16 }
    : { engine: 'WORKBENCH', device: 'CPU', width: 960, height: 540, samples: 1 }

  // 4. Video-Encoder: schnellster funktionierender, Hardware bevorzugt
  const workingEnc = encoders.filter((e) => e.ok)
  const encoder = best(workingEnc, (e) => ENCODER_ORDER.indexOf(e.encoder) * 10_000 - (e.fps ?? 0))?.encoder ?? 'libx264'
  if (encoder !== 'libx264') notes.push({ key: 'hw.notiz.encoder', werte: { encoder } })

  // 5. Whisper, ONNX und lokale Bildmodelle nach Grafikkarte/CPU
  const gpus = hw.gpus.filter((g) => g.physical)
  const nvidia = gpus.filter((g) => g.vendor === 'nvidia').sort((a, b) => (b.vramMB ?? 0) - (a.vramMB ?? 0))[0]
  let whisper: WhisperChoice
  if (nvidia && (nvidia.vramMB ?? 0) >= 6000) whisper = { model: 'large-v3-turbo', device: 'cuda', compute: 'float16' }
  else if (hw.cpuThreads >= 12 && hw.ramGB >= 16) whisper = { model: 'medium', device: 'cpu', compute: 'int8' }
  else if (hw.cpuThreads >= 4) whisper = { model: 'small', device: 'cpu', compute: 'int8' }
  else whisper = { model: 'base', device: 'cpu', compute: 'int8' }

  const onnx = onnxProvider(hw)
  notes.push(onnx === 'cpu' ? { key: 'hw.notiz.onnxCpu' } : { key: 'hw.notiz.onnxGpu', werte: { provider: onnx === 'cuda' ? 'CUDA' : 'DirectML' } })

  const dedicatedVram = Math.max(0, ...gpus.filter((g) => g.vendor === 'nvidia' || g.vendor === 'amd').map((g) => g.vramMB ?? 0))
  const imageModels: ImageModelTier = dedicatedVram >= 13_000 ? 'flux' : dedicatedVram >= 8_000 ? 'sdxl' : dedicatedVram >= 6_000 ? 'small' : 'off'
  if (imageModels === 'off') notes.push({ key: 'hw.notiz.bildAus' })

  return { blenderVersion, blenderUebersprungen: !blenderGetestet, blenderMesa, preview, final, finalSecondsEstimate, encoder, whisper, imageModels, onnx, notes }
}

/**
 * ONNX-Anbieter nach Grafikkarte: NVIDIA mit genug VRAM → CUDA, andere echte GPUs (AMD, Intel, NVIDIA mit wenig VRAM)
 * → DirectML, sonst CPU. Gemessen wird beim ersten Einsatz; scheitert der GPU-Weg dort, fällt die Aufgabe auf die CPU
 * zurück.
 */
export function onnxProvider(hw: HardwareInfo): OnnxProvider {
  const gpus = hw.gpus.filter((g) => g.physical && g.vendor !== 'other')
  if (gpus.some((g) => g.vendor === 'nvidia' && (g.vramMB ?? 0) >= 4000)) return 'cuda'
  if (gpus.length > 0) return 'directml'
  return 'cpu'
}
