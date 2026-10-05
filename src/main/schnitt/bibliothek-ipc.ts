// Herkunft: MoinStudio src/main/schnitt/bibliothek-ipc.ts (MIT, v0.50.0), über die gemeinsame Schnitt-Anbindung (IPC und MCP).
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { IPC, type BibDateiErgebnis, type BibEffektDaten } from '@shared/app'
import { t } from '../i18n'
import { dateiInBibliothek, ladeBibliothek, loescheBibEffekt, speichereBibEffekt, STANDARD_CHROMA, type BibEffekt, type Chroma } from './bibliothek'
import { dauerVon, keyFarbeErkennen, pixelFarbe, vorschauBild } from './chroma'
import { ladeProjekte, projektOrdner } from './projekt'

type Biete = <A extends unknown[]>(kanal: string, fn: (...a: A) => unknown) => void

/** Oberfläche ↔ Effekt-Bibliothek. Dateien liegen im Datenordner, Pfade werden hier aufgelöst. */
export function registerBibliothek(o: { biete: Biete; daten: () => Promise<string>; ffmpeg: () => Promise<string>; oeffnen: (optionen: Electron.OpenDialogOptions) => Promise<string | null> }): void {
  // Ordner eines Effekts, auch wenn er noch nicht gespeichert ist (erste Datei hochgeladen, Name fehlt noch)
  const ordnerDatei = (daten: string, id: string, datei: string): string => join(daten, 'effekte', id, datei)
  const gueltig = (d: unknown): d is string => typeof d === 'string' && /^[\w.-]+$/.test(d)
  const gueltigeId = (id: unknown): id is string => typeof id === 'string' && /^[a-z0-9-]+$/i.test(id)

  o.biete(IPC.schnittBib, async (): Promise<BibEffektDaten[]> => ladeBibliothek(await o.daten()))
  o.biete(IPC.schnittBibSpeichern, async (roh: unknown): Promise<BibEffektDaten> => speichereBibEffekt(await o.daten(), roh as Partial<BibEffekt>))
  o.biete(IPC.schnittBibLoeschen, async (id: unknown): Promise<void> => loescheBibEffekt(await o.daten(), String(id)))

  o.biete(IPC.schnittBibDatei, async (idRoh: unknown, rolle: unknown, greenscreen: unknown): Promise<BibDateiErgebnis | null> => {
    const r = rolle === 'bild' || rolle === 'sound' ? rolle : 'video'
    const endungen = r === 'video' ? ['mp4', 'mov', 'webm', 'mkv', 'avi', 'gif'] : r === 'bild' ? ['png', 'jpg', 'jpeg', 'webp', 'gif'] : ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac']
    const titel = t(r === 'video' ? (greenscreen ? 'bib.dialog.greenscreen' : 'bib.dialog.video') : r === 'bild' ? 'bib.dialog.bild' : 'bib.dialog.sound')
    const quelle = await o.oeffnen({ title: titel, filters: [{ name: titel, extensions: endungen }], properties: ['openFile'] })
    if (!quelle) return null
    const daten = await o.daten()
    const id = gueltigeId(idRoh) ? idRoh : randomUUID().slice(0, 8)
    const datei = await dateiInBibliothek(daten, id, r, quelle)
    const pfad = ordnerDatei(daten, id, datei)
    const ff = await o.ffmpeg()
    const dauer = r === 'bild' ? 0 : await dauerVon(ff, pfad).catch(() => 0)
    // Greenscreen: Key-Farbe gleich erkennen; nicht eindeutig → Standard-Grün, die Pipette hilft nach
    const chroma: Chroma | null = r === 'video' && greenscreen ? { ...STANDARD_CHROMA, farbe: (await keyFarbeErkennen(ff, pfad).catch(() => null)) ?? STANDARD_CHROMA.farbe } : null
    return { id, datei, dauer, chroma, erkannt: !!chroma && chroma.farbe !== STANDARD_CHROMA.farbe }
  })

  o.biete(IPC.schnittBibVorschau, async (id: unknown, opts: unknown): Promise<string | null> => {
    if (!gueltigeId(id)) return null
    const daten = await o.daten()
    const v = (opts ?? {}) as { video?: string; bild?: string; chroma?: Chroma | null; zeit?: number; roh?: boolean }
    const pfad = (d?: string): string | undefined => (gueltig(d) ? ordnerDatei(daten, id, d) : undefined)
    const video = pfad(v.video)
    const bild = pfad(v.bild)
    if (!video && !bild) return null
    // Beispielbild: ein Standbild aus dem neuesten Projekt (so sieht man den Effekt über echtem Material)
    const projekt = (await ladeProjekte(daten)).filter((p) => p.proxy).sort((a, b) => b.erstellt.localeCompare(a.erstellt))[0]
    const proxy = projekt ? join(projektOrdner(daten, projekt.id), 'proxy.mp4') : null
    return vorschauBild(await o.ffmpeg(), { video, bild, chroma: v.chroma ?? null, zeit: v.zeit ?? 0.5, hintergrund: proxy && existsSync(proxy) ? proxy : null, roh: !!v.roh })
  })

  o.biete(IPC.schnittBibPipette, async (id: unknown, datei: unknown, x: unknown, y: unknown, zeit: unknown): Promise<string> => {
    if (!gueltigeId(id) || !gueltig(datei)) throw new Error(t('bib.fehler.keineDatei'))
    return pixelFarbe(await o.ffmpeg(), ordnerDatei(await o.daten(), id, datei), Number(x), Number(y), Number(zeit) || 0.5)
  })
}
