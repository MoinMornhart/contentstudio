// Herkunft: MoinStudio src/shared/hardware.ts (MIT), erweitert um ONNX-Anbieter und übersetzbare Hinweise.
import type { Schluessel, Werte } from './i18n'

/** Datentypen des Hardware-Tests – gemeinsam für Main-Prozess und Oberfläche. */

export type GpuVendor = 'nvidia' | 'amd' | 'intel' | 'microsoft' | 'virtual' | 'other'

export interface GpuInfo {
  name: string
  vendor: GpuVendor
  /** Grafikspeicher in MB, null wenn unbekannt */
  vramMB: number | null
  driver: string | null
  /** false für Software-/Basis-/VM-Adapter ohne echte 3D-Beschleunigung */
  physical: boolean
}

export interface HardwareInfo {
  os: string
  cpuModel: string
  cpuThreads: number
  ramGB: number
  freeDiskGB: number
  gpus: GpuInfo[]
}

export type BlenderEngine = 'CYCLES' | 'EEVEE' | 'WORKBENCH'
export type CyclesDevice = 'CPU' | 'OPTIX' | 'CUDA' | 'HIP' | 'ONEAPI' | 'METAL'
export type FailReason = 'illegal-instruction' | 'crash' | 'timeout' | 'error' | 'black-image'

export interface RenderBench {
  blender: string
  engine: BlenderEngine
  device: CyclesDevice
  mesa: boolean
  ok: boolean
  seconds: number | null
  reason?: FailReason
  detail?: string
}

export interface EncoderBench {
  encoder: string
  ok: boolean
  fps: number | null
}

export type WhisperChoice = {
  model: 'large-v3-turbo' | 'medium' | 'small' | 'base'
  device: 'cuda' | 'cpu'
  compute: 'float16' | 'int8'
}
export type ImageModelTier = 'off' | 'small' | 'sdxl' | 'flux'
/** ONNX-Ausführung für Freistellen, Gesichts- und Posenerkennung (Rückfall-Kette endet immer bei der CPU) */
export type OnnxProvider = 'cuda' | 'directml' | 'cpu'

export interface RenderSetting {
  engine: BlenderEngine
  device: CyclesDevice
  width: number
  height: number
  samples: number
}

/** Hinweis für die Anzeige, in der Sprache der Oberfläche übersetzt */
export interface HardwareNotiz {
  key: Schluessel
  werte?: Werte
}

export interface DeviceConfig {
  /** null = Blender läuft nicht oder wurde nicht getestet (kein 3D gewählt) */
  blenderVersion: string | null
  /** true = Blender wurde bewusst nicht getestet, weil kein 3D gebraucht wird */
  blenderUebersprungen: boolean
  /** Mesa-Software-OpenGL neben blender.exe (nur Rechner ohne echte GPU) */
  blenderMesa: boolean
  preview: RenderSetting
  final: RenderSetting
  /** Geschätzte Sekunden für ein Endbild (grobe Hochrechnung aus dem Test) */
  finalSecondsEstimate: number | null
  encoder: string
  whisper: WhisperChoice
  imageModels: ImageModelTier
  onnx: OnnxProvider
  /** Kurze, verständliche Begründungen für die Anzeige */
  notes: HardwareNotiz[]
}

export interface DeviceProfile {
  format: 2
  createdAt: string
  fingerprint: string
  hardware: HardwareInfo
  renders: RenderBench[]
  encoders: EncoderBench[]
  config: DeviceConfig
  /** In den Einstellungen von Hand überschriebene Werte (haben Vorrang) */
  overrides: Partial<DeviceConfig>
  durationSeconds: number
}

export interface HardwareProgress {
  percent: number
  step: string
}

export type HardwareState =
  | { state: 'none' }
  | { state: 'running'; progress: HardwareProgress }
  | { state: 'done'; profile: DeviceProfile; outdated: boolean }
  | { state: 'error'; message: string; profile: DeviceProfile | null }
