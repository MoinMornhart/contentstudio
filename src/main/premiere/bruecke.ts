// Herkunft: MoinStudio src/main/premiere/bruecke.ts (MIT), v0.47.0 – ungetestet (kein Premiere auf dem Entwicklungsrechner).
import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { t } from '../i18n'
import { starteWsServer, type WsVerbindung } from './websocket'

/**
 * Brücke zu Premiere Pro: Das UXP-Plugin „ContentStudio Bridge“ (premiere-plugin/) verbindet sich per WebSocket mit
 * ContentStudio. Protokoll (JSON je Nachricht):
 *   ContentStudio → Plugin  {id, befehl, args, schluessel}
 *   Plugin → ContentStudio  {id, ok: true, ergebnis} | {id, ok: false, fehler} | {ereignis, daten} | {hallo: {version, premiere}}
 */

/** Eigener Port (MoinStudio nutzt 47811), damit beide Apps nebeneinander laufen können */
export const BRUECKE_PORT = 47812

export interface BrueckenInfo {
  version: string
  premiere: string
}

export class PremiereBruecke extends EventEmitter {
  private server: Server | null = null
  private verbindung: WsVerbindung | null = null
  private naechsteId = 1
  private offen = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; wache: NodeJS.Timeout }>()
  info: BrueckenInfo | null = null

  get verbunden(): boolean {
    return this.verbindung !== null
  }

  /** Zufallsschlüssel je Start, liegt in %LOCALAPPDATA%\ContentStudio\premiere\schluessel; das Plugin führt nur Befehle
   *  aus, die ihn mitschicken */
  private schluessel = randomBytes(24).toString('hex')

  constructor(private readonly schluesselOrdner: string) {
    super()
  }

  async start(port = BRUECKE_PORT): Promise<void> {
    if (this.server) return
    await mkdir(this.schluesselOrdner, { recursive: true })
    await writeFile(join(this.schluesselOrdner, 'schluessel'), this.schluessel, 'utf8')
    this.server = await starteWsServer(port, (v, nachricht, ende) => {
      // immer nur ein Premiere: eine neue Verbindung ersetzt die alte
      this.verbindung?.schliessen()
      this.verbindung = v
      nachricht((text) => this.empfange(text))
      ende(() => {
        if (this.verbindung === v) {
          this.verbindung = null
          this.info = null
          for (const [, o] of this.offen) {
            clearTimeout(o.wache)
            o.reject(new Error(t('premiere.bruecke.getrennt')))
          }
          this.offen.clear()
          this.emit('getrennt')
        }
      })
    })
  }

  stop(): void {
    this.verbindung?.schliessen()
    this.server?.close()
    this.server = null
  }

  /** Wartet, bis sich das Plugin meldet (Premiere startet, Plugin lädt). */
  warteAufVerbindung(ms: number): Promise<BrueckenInfo> {
    if (this.info) return Promise.resolve(this.info)
    return new Promise((resolve, reject) => {
      const uhr = setTimeout(() => {
        this.off('hallo', ok)
        reject(new Error(t('premiere.bruecke.stumm')))
      }, ms)
      const ok = (i: BrueckenInfo): void => {
        clearTimeout(uhr)
        resolve(i)
      }
      this.once('hallo', ok)
    })
  }

  befehl<T = unknown>(befehl: string, args: Record<string, unknown> = {}, zeitlimitMs = 120_000): Promise<T> {
    const v = this.verbindung
    if (!v) return Promise.reject(new Error(t('premiere.bruecke.nichtVerbunden')))
    const id = this.naechsteId++
    return new Promise<T>((resolve, reject) => {
      const wache = setTimeout(() => {
        this.offen.delete(id)
        reject(new Error(t('premiere.bruecke.keineAntwort', { befehl })))
      }, zeitlimitMs)
      this.offen.set(id, { resolve: resolve as (v: unknown) => void, reject, wache })
      v.senden(JSON.stringify({ id, befehl, args, schluessel: this.schluessel }))
    })
  }

  private empfange(text: string): void {
    let m: { id?: number; ok?: boolean; ergebnis?: unknown; fehler?: string; ereignis?: string; daten?: unknown; hallo?: BrueckenInfo }
    try {
      m = JSON.parse(text) as typeof m
    } catch {
      return
    }
    if (m.hallo) {
      this.info = m.hallo
      this.emit('hallo', m.hallo)
      return
    }
    if (m.ereignis) {
      this.emit('ereignis', m.ereignis, m.daten)
      return
    }
    if (typeof m.id === 'number') {
      const o = this.offen.get(m.id)
      if (!o) return
      this.offen.delete(m.id)
      clearTimeout(o.wache)
      if (m.ok) o.resolve(m.ergebnis)
      else o.reject(new Error(m.fehler ?? t('premiere.bruecke.fehler')))
    }
  }
}
