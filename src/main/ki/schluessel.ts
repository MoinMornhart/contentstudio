import { join } from 'node:path'
import { z } from 'zod'
import { readJson, writeJsonAtomic } from '../data/jsonfile'
import { t } from '../i18n'

/** Verschlüsselung über den Schlüsselspeicher des Betriebssystems (Electron `safeStorage`, unter Windows DPAPI) */
export interface Tresor {
  verfuegbar(): boolean
  verschluesseln(klartext: string): Buffer
  entschluesseln(daten: Buffer): string
}

const Datei = z.record(z.string(), z.string())

/**
 * API-Schlüssel des Nutzers (ROADMAP 3.5). Liegen nur verschlüsselt in %APPDATA%\ContentStudio\ki-schluessel.json:
 * nie im Klartext, nie im Datenordner (der wird synchronisiert), nie in Protokollen. Ohne verfügbare Verschlüsselung
 * wird nichts gespeichert. Gefragt wird nur, wenn der Nutzer den Weg „API-Schlüssel“ selbst wählt.
 */
export class SchluesselSpeicher {
  constructor(
    private readonly ordner: string,
    private readonly tresor: Tresor
  ) {}

  private get pfad(): string {
    return join(this.ordner, 'ki-schluessel.json')
  }

  private async lesen(): Promise<Record<string, string>> {
    const r = await readJson(this.pfad, Datei)
    return r.ok ? r.value : {}
  }

  /** Schlüssel speichern (null = löschen) */
  async setze(anbieter: string, schluessel: string | null): Promise<void> {
    const alle = await this.lesen()
    if (schluessel === null || !schluessel.trim()) delete alle[anbieter]
    else {
      if (!this.tresor.verfuegbar()) throw new Error(t('ki.keineVerschluesselung'))
      alle[anbieter] = this.tresor.verschluesseln(schluessel.trim()).toString('base64')
    }
    await writeJsonAtomic(this.pfad, alle)
  }

  async hat(anbieter: string): Promise<boolean> {
    return anbieter in (await this.lesen())
  }

  /** Klartext nur für den Aufruf beim Anbieter; wird nie zurück an die Oberfläche gegeben */
  async hole(anbieter: string): Promise<string | null> {
    const wert = (await this.lesen())[anbieter]
    if (!wert || !this.tresor.verfuegbar()) return null
    try {
      return this.tresor.entschluesseln(Buffer.from(wert, 'base64'))
    } catch {
      return null
    }
  }
}

/** Entfernt Schlüssel-ähnliche Zeichenketten aus Texten, bevor sie in Protokolle oder Fehlermeldungen gehen */
export function ohneSchluessel(text: string): string {
  return text
    .replace(/sk-ant-[\w-]{10,}/g, 'sk-ant-***')
    .replace(/sk-(?:proj-|or-v1-)?[\w-]{16,}/g, 'sk-***')
    .replace(/AIza[\w-]{20,}/g, 'AIza***')
    .replace(/([?&]key=)[^&\s]+/g, '$1***')
    .replace(/(x-api-key|authorization)(["':\s]+)(Bearer\s+)?[^\s"',}]+/gi, '$1$2$3***')
}
