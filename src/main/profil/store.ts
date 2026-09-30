import { EventEmitter } from 'node:events'
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, extname, isAbsolute, join, normalize, relative } from 'node:path'
import { leeresProfil, PROFIL_DATEI, profilAus, ProfilFehler, type Profil } from '@shared/profil'
import { ensureDataLayout, resolveDataDir } from '../data/datadir'
import { liesMitKonfliktkopien, writeJsonAtomic } from '../data/jsonfile'
import type { SettingsStore } from '../data/settings'

/** Standard-Datenordner, wenn der Nutzer im Assistenten keinen wählt: Dokumente\ContentStudio */
export function standardDatenordner(): string {
  return join(homedir(), 'Documents', 'ContentStudio')
}

/**
 * Creator-Profil im Datenordner (ROADMAP 2.1). Lesen repariert Konfliktkopien der Sync-Dienste, Schreiben ist atomar.
 * Fehlt die Datei, gilt ein leeres Profil mit Standards (gespeichert wird erst bei der ersten Änderung).
 * Ereignis „change“ bei jeder Änderung.
 */
export class ProfilStore extends EventEmitter {
  private cache: { ordner: string; profil: Profil } | null = null

  constructor(private readonly settings: SettingsStore) {
    super()
  }

  /** Datenordner; ohne Wahl wird der Standardordner angelegt und gespeichert. */
  async datenordner(): Promise<string> {
    const { dataDir } = await this.settings.load()
    if (dataDir) return dataDir
    const ordner = await resolveDataDir(standardDatenordner())
    await ensureDataLayout(ordner)
    await this.settings.update({ dataDir: ordner })
    return ordner
  }

  /** Profil lesen; wirft ProfilFehler bei ungültigem Inhalt (die Datei bleibt dann unangetastet). */
  async laden(): Promise<Profil> {
    const { dataDir } = await this.settings.load()
    if (!dataDir) return leeresProfil()
    if (this.cache?.ordner === dataDir) return this.cache.profil
    let text: string
    try {
      text = await liesMitKonfliktkopien(join(dataDir, PROFIL_DATEI))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return leeresProfil()
      throw err
    }
    let roh: unknown
    try {
      roh = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
    } catch (err) {
      throw new ProfilFehler(`creator-profile.json: ${(err as Error).message}`)
    }
    const profil = profilAus(roh)
    this.cache = { ordner: dataDir, profil }
    return profil
  }

  /** Ganzes Profil speichern (vorher geprüft). Setzt „geaendert“. */
  async speichern(neu: unknown): Promise<Profil> {
    const profil = profilAus({ ...(neu as object), geaendert: new Date().toISOString() })
    const ordner = await this.datenordner()
    await ensureDataLayout(ordner)
    await writeJsonAtomic(join(ordner, PROFIL_DATEI), profil)
    this.cache = { ordner, profil }
    this.emit('change', profil)
    return profil
  }

  /** Änderung als Funktion auf dem aktuellen Stand (vermeidet verlorene Änderungen bei parallelen Aufrufen) */
  async aendern(fn: (p: Profil) => Profil): Promise<Profil> {
    return this.speichern(fn(structuredClone(await this.laden())))
  }

  /** Nach einem Wechsel des Datenordners neu lesen */
  vergessen(): void {
    this.cache = null
  }

  /**
   * Kopiert eine Datei des Nutzers in den Datenordner (z. B. Foto nach „avatare/“) und gibt den relativen Pfad zurück.
   * Vorhandene Namen werden nicht überschrieben.
   */
  async dateiAblegen(quelle: string, unterordner: string): Promise<string> {
    const ordner = await this.datenordner()
    const zielOrdner = join(ordner, unterordner)
    await mkdir(zielOrdner, { recursive: true })
    const endung = extname(quelle).toLowerCase()
    const stamm = basename(quelle, extname(quelle)).replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 60) || 'datei'
    let name = `${stamm}${endung}`
    for (let i = 2; await stat(join(zielOrdner, name)).catch(() => null); i++) name = `${stamm}-${i}${endung}`
    await copyFile(quelle, join(zielOrdner, name))
    return `${unterordner}/${name}`
  }

  /** Schreibt Bytes (z. B. einen geladenen Skin) in den Datenordner und gibt den relativen Pfad zurück. */
  async bytesAblegen(daten: Buffer, unterordner: string, name: string): Promise<string> {
    const ordner = await this.datenordner()
    await mkdir(join(ordner, unterordner), { recursive: true })
    await writeFile(join(ordner, unterordner, name), daten)
    return `${unterordner}/${name}`
  }

  /** Absoluter Pfad zu einer Datei im Datenordner – nur innerhalb des Datenordners (keine „..“-Tricks). */
  async absolut(rel: string): Promise<string> {
    const ordner = await this.datenordner()
    const ziel = normalize(join(ordner, rel))
    const r = relative(ordner, ziel)
    if (!r || r.startsWith('..') || isAbsolute(r)) throw new Error('Pfad außerhalb des Datenordners')
    return ziel
  }

  /** Bild aus dem Datenordner als Data-URL (Vorschau in der Oberfläche) */
  async bildUrl(rel: string): Promise<string | null> {
    try {
      const pfad = await this.absolut(rel)
      const typ = MIME[extname(pfad).toLowerCase()] ?? 'application/octet-stream'
      return `data:${typ};base64,${(await readFile(pfad)).toString('base64')}`
    } catch {
      return null
    }
  }
}

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
}
