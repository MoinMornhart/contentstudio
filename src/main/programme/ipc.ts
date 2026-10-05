// Herkunft: MoinStudio src/main/adobe/ipc.ts (MIT), für Premiere, After Effects, DaVinci Resolve, CapCut und Photoshop.
import { dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import { IPC } from '@shared/app'
import type { ProgrammeStand, ProgrammId, SchnittZiel } from '@shared/programme'
import { readJson, writeJsonAtomic } from '../data/jsonfile'
import { z } from 'zod'
import { t } from '../i18n'
import type { JobQueue } from '../jobs/queue'
import type { ProfilStore } from '../profil/store'
import type { ToolManager } from '../tools/manager'
import { FFMPEG } from '../tools/specs'
import { localRoot } from '../tools/ipc'
import { capcutOrdner, type CapcutEingabe } from './capcut'
import { findeProgramme, PROGRAMM_NAMEN, type ErkanntesProgramm } from './erkennung'
import { capcutEingabe, programmDateien } from './projekt-export'
import { programmeAuffrischen } from './geraet'
import { erzeugeProben, selbsttest, type Proben } from './selbsttest'

const Tests = z.record(z.string(), z.object({ status: z.enum(['ok', 'fehler', 'übersprungen', 'checkliste']), details: z.string(), zeit: z.string(), datei: z.string().nullable() }))

/** Programme (ROADMAP M7): Erkennung, Selbsttests und Weitergabe eines Schnitt-Projekts an Premiere, AE, Resolve, CapCut. */
export function registerProgrammeIpc(o: { queue: JobQueue; profil: ProfilStore; tools: ToolManager; fenster: () => BrowserWindow | undefined; userData: string }): void {
  const testDatei = join(o.userData, 'programm-tests.json')
  let letzte: Promise<ErkanntesProgramm[]> | null = null
  const erkannt = (neu = false): Promise<ErkanntesProgramm[]> => (letzte && !neu ? letzte : (letzte = findeProgramme()))
  const stand = async (neu = false): Promise<ProgrammeStand> => {
    const programme = await erkannt(neu)
    const tests = await readJson(testDatei, Tests)
    return { programme: programme.map((p) => ({ id: p.id, name: p.name || PROGRAMM_NAMEN[p.id], version: p.version, beta: p.beta, pfad: p.pfad })), gesucht: new Date().toISOString(), tests: tests.ok ? (tests.value as ProgrammeStand['tests']) : {} }
  }
  const ffmpeg = async (): Promise<string> => {
    const ff = await o.tools.exePath(FFMPEG)
    if (!ff) throw new Error(t('thumb.fehlt.ffmpeg'))
    return ff
  }

  ipcMain.handle(IPC.programmeStatus, (_e, neu: unknown) => stand(neu === true))
  // Selbsttest: Proben lokal (nicht im geteilten Datenordner), einmal je Lauf erzeugt
  ipcMain.handle(IPC.programmSelbsttest, async (_e, id: unknown) => {
    let proben: Promise<Proben> | null = null
    const ergebnis = await selbsttest(id as ProgrammId, await erkannt(true), async () => (proben ??= ffmpeg().then((ff) => erzeugeProben(join(localRoot(), 'programm-test'), ff))))
    const alt = await readJson(testDatei, Tests)
    await writeJsonAtomic(testDatei, { ...(alt.ok ? alt.value : {}), [ergebnis.id]: { status: ergebnis.status, details: ergebnis.details, zeit: new Date().toISOString(), datei: ergebnis.datei } })
    if (ergebnis.datei && ergebnis.status !== 'übersprungen') void shell.openPath(ergebnis.datei)
    return ergebnis
  })

  // Beim Start: Programmdateien im Datenordner auf die Pfade dieses Geräts umstellen (PC ↔ Laptop über den Datenordner)
  setTimeout(() => {
    void o.profil
      .datenordner()
      .then(async (daten) => {
        // mit FFmpeg behalten Premiere-Dateien ihre Effekt-Clips (fertige Wandlungen im Projekt werden wiederverwendet)
        const ff = await ffmpeg().catch(() => null)
        const werkzeuge = ff ? { ffmpeg: ff, klaenge: join(localRoot(), 'klaenge') } : null
        return programmeAuffrischen(daten, (d, id, ziel) => programmDateien(d, id, ziel, werkzeuge), (text) => console.log(text))
      })
      .catch(() => undefined)
  }, 8000)

  // Weitergabe eines Schnitt-Projekts (ROADMAP 7.1–7.3)
  o.queue.register('capcut', (p: CapcutEingabe, ctx) => capcutOrdner(p, ctx))
  ipcMain.handle(IPC.schnittProgramm, async (_e, id: unknown, ziel: unknown): Promise<{ datei: string | null; auftrag: string | null }> => {
    const daten = await o.profil.datenordner()
    const z = ziel as SchnittZiel
    if (z === 'capcut') {
      const win = o.fenster()
      const opts: Electron.OpenDialogOptions = { title: t('programme.capcut.dialog'), properties: ['openDirectory', 'createDirectory'] }
      const wahl = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
      if (wahl.canceled || !wahl.filePaths[0]) return { datei: null, auftrag: null }
      const eingabe = await capcutEingabe(daten, String(id), wahl.filePaths[0], await ffmpeg())
      return { datei: eingabe.ziel, auftrag: await o.queue.enqueue('capcut', t('programme.capcut.titel', { name: eingabe.titel }), eingabe) }
    }
    if (z !== 'premiere' && z !== 'aftereffects' && z !== 'resolve') throw new Error(t('planung.fehler.aktion', { aktion: String(ziel) }))
    const ff = z === 'premiere' ? await ffmpeg().catch(() => null) : null
    const r = await programmDateien(daten, String(id), z, ff ? { ffmpeg: ff, klaenge: join(localRoot(), 'klaenge') } : null)
    shell.showItemInFolder(r.datei)
    return { datei: r.datei, auftrag: null }
  })
}
