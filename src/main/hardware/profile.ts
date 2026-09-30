import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { z } from 'zod'
import { readJson, writeJsonAtomic } from '../data/jsonfile'
import type { DeviceConfig, DeviceProfile, HardwareInfo } from '@shared/hardware'

export type { DeviceProfile } from '@shared/hardware'

// Das Profil wird nur von ContentStudio selbst geschrieben; geprüft werden die Kernfelder.
const ProfileSchema = z
  .object({
    // Format 2: Hinweise als Übersetzungsschlüssel, ONNX-Anbieter, optionales Blender. Ältere Profile → neu testen.
    format: z.literal(2),
    createdAt: z.string(),
    fingerprint: z.string(),
    hardware: z.object({ gpus: z.array(z.any()) }).passthrough(),
    renders: z.array(z.any()),
    encoders: z.array(z.any()),
    config: z.object({ encoder: z.string() }).passthrough(),
    overrides: z.record(z.string(), z.any()).default({}),
    durationSeconds: z.number()
  })
  .passthrough()

/**
 * Fingerabdruck des Geräts: Ändert er sich, wird der Hardware-Test wiederholt.
 * App-Version nur als „Major.Minor“, damit nicht jedes kleine Update einen neuen Test auslöst.
 */
export function fingerprint(hw: HardwareInfo, appVersion: string, blenderVersions: string[]): string {
  const minor = appVersion.split('.').slice(0, 2).join('.')
  const data = {
    cpu: hw.cpuModel,
    threads: hw.cpuThreads,
    ram: Math.round(hw.ramGB),
    gpus: hw.gpus.map((g) => `${g.name}|${g.driver ?? ''}`).sort(),
    app: minor,
    blender: [...blenderVersions].sort()
  }
  return createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16)
}

export class ProfileStore {
  constructor(private readonly dir: string) {}

  get path(): string {
    return join(this.dir, 'device-profile.json')
  }

  async load(): Promise<DeviceProfile | null> {
    const res = await readJson(this.path, ProfileSchema)
    return res.ok ? (res.value as unknown as DeviceProfile) : null
  }

  async save(profile: DeviceProfile): Promise<void> {
    await writeJsonAtomic(this.path, profile)
  }

  /** Wirksame Konfiguration = automatisch ermittelt + manuelle Überschreibungen. */
  static effective(profile: DeviceProfile): DeviceConfig {
    return { ...profile.config, ...profile.overrides }
  }
}
