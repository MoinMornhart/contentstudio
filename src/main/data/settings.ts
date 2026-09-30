// Herkunft: MoinStudio src/main/data/settings.ts (MIT), erweitert um die Sprache der Oberfläche.
import { join } from 'node:path'
import { z } from 'zod'
import { SPRACHEN } from '@shared/i18n'
import { readJson, writeJsonAtomic } from './jsonfile'

/**
 * Geräte-Einstellungen in %APPDATA%\ContentStudio\settings.json. Sie gelten nur für dieses Gerät
 * (PC und Laptop unterscheiden sich) und werden deshalb nicht im Datenordner gespeichert.
 */
export const SettingsSchema = z.object({
  format: z.literal(1).default(1),
  dataDir: z.string().nullable().default(null),
  setupCompleted: z.boolean().default(false),
  /** Sprache der Oberfläche; null = wie Windows */
  sprache: z.enum(SPRACHEN).nullable().default(null)
})

export type Settings = z.infer<typeof SettingsSchema>

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({})

export class SettingsStore {
  private cache: Settings | null = null
  constructor(private readonly dir: string) {}

  get path(): string {
    return join(this.dir, 'settings.json')
  }

  async load(): Promise<Settings> {
    if (this.cache) return this.cache
    const res = await readJson(this.path, SettingsSchema)
    // Kaputte oder fehlende Datei: mit Standardwerten weiterarbeiten statt abzustürzen.
    this.cache = res.ok ? res.value : { ...DEFAULT_SETTINGS }
    return this.cache
  }

  async update(patch: Partial<Settings>): Promise<Settings> {
    const next = SettingsSchema.parse({ ...(await this.load()), ...patch })
    await writeJsonAtomic(this.path, next)
    this.cache = next
    return next
  }
}
