import { clipboard, dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import { IPC } from '@shared/app'
import {
  ThumbStartSchema,
  type ExportFormat,
  type ThumbAuftragInfo,
  type VarianteInfo,
  type VideoErgebnis,
  type Vorbild
} from '@shared/thumbnail'
import type { SettingsStore } from '../data/settings'
import type { HardwareController } from '../hardware/controller'
import { ProfileStore } from '../hardware/profile'
import type { JobContext, JobQueue } from '../jobs/queue'
import type { KiSchicht } from '../ki/schicht'
import type { ProfilStore } from '../profil/store'
import { resourceDir } from '../resources'
import type { ToolManager } from '../tools/manager'
import { BLENDER_FALLBACK, BLENDER_PRIMARY, FFMPEG, UV } from '../tools/specs'
import { werkzeugRoot } from '../tools/ipc'
import { hauptSprache, t } from '../i18n'
import { aenderungJob, type AenderungPayload } from './aenderung'
import { baueAuftrag, engineFuer } from './auftrag'
import { exportiereFormat, exportierePsd } from './export'
import { thumbnailJob } from './job'
import { reaktionJob } from './reaktion'
import type { ThumbErgebnisDaten, ThumbPayload } from './typen'
import { sicherePython, type ThumbUmgebung } from './umgebung'
import { beispielFuer, ladeBeispiele, VorbildStore } from './vorbilder'
import { videoJob, type VideoPayload } from './video'
import { vorlageJob } from './vorlage'

/** Aufgabenarten des Thumbnail-Bereichs */
export const THUMB_ARTEN_JOBS = ['thumbnail', 'reaktion', 'vorlage', 'aenderung', 'video', 'vorbild-analyse'] as const

/** Kontext für kurze Arbeiten außerhalb der Warteschlange (Export) */
function stillerKontext(): JobContext<unknown> {
  return {
    id: 'export',
    checkpoint: undefined,
    save: async () => undefined,
    progress: () => undefined,
    yield: async () => undefined,
    signal: new AbortController().signal,
    track: () => undefined,
    waitUntil: () => {
      throw new Error('export')
    }
  }
}

const imOrdner = (dir: string, pfad: string): boolean => resolve(pfad).startsWith(resolve(dir) + sep)

/** Bild als data:-URL; Sync-Dienste sperren frisch geschriebene Dateien kurz – deshalb mehrere Versuche */
async function alsDataUrl(pfad: string): Promise<string | null> {
  const typ = extname(pfad).toLowerCase() === '.jpg' ? 'image/jpeg' : 'image/png'
  for (let versuch = 0; versuch < 6; versuch++) {
    try {
      return `data:${typ};base64,${(await readFile(pfad)).toString('base64')}`
    } catch {
      await new Promise((r) => setTimeout(r, 400))
    }
  }
  return null
}

export function registerThumbnailIpc(o: {
  queue: JobQueue
  settings: SettingsStore
  profil: ProfilStore
  hardware: HardwareController
  tools: ToolManager
  ki: KiSchicht
  fenster: () => BrowserWindow | undefined
}): { starte: (roh: unknown) => Promise<string>; starteVideo: (video: string, kontoId: string, titel?: string) => Promise<string>; vorbilder: VorbildStore } {
  const { queue, profil, tools } = o
  const vorbilder = new VorbildStore(profil)
  const d = { ki: o.ki }
  queue.register('thumbnail', (p: ThumbPayload, ctx) => thumbnailJob(p, ctx as never, d))
  queue.register('reaktion', (p: ThumbPayload, ctx) => reaktionJob(p, ctx as never, d))
  queue.register('vorlage', (p: ThumbPayload, ctx) => vorlageJob(p, ctx as never, d))
  queue.register('aenderung', (p: AenderungPayload, ctx) => aenderungJob(p, ctx as never, d))
  queue.register('video', (p: VideoPayload, ctx) => videoJob(p, ctx, d))
  queue.register('vorbild-analyse', async (p: { kontoId: string }, ctx) => {
    await vorbilder.kiAnalyse(p.kontoId, o.ki, ctx, (i, n) => ctx.progress(Math.round((i / Math.max(1, n)) * 80), t('thumb.vorbild.analysiere', { nr: i + 1, von: n })))
    ctx.progress(90, t('thumb.vorbild.stilbuch'))
    const konto = (await profil.laden()).konten.find((k) => k.id === p.kontoId)
    const beispiel = konto ? beispielFuer(konto, await ladeBeispiele(resourceDir('stilbuecher'))) : null
    return vorbilder.erstelleStilbuch(p.kontoId, { ki: o.ki, beispiel, ctx })
  })

  const fenster = (): BrowserWindow | undefined => o.fenster()
  const oeffnen = async (optionen: Electron.OpenDialogOptions): Promise<string | null> => {
    const win = fenster()
    const r = win ? await dialog.showOpenDialog(win, optionen) : await dialog.showOpenDialog(optionen)
    return r.canceled ? null : (r.filePaths[0] ?? null)
  }

  const umgebung = async (brauchtBlender: boolean): Promise<ThumbUmgebung> => {
    const profile = await o.hardware.profiles.load()
    let blender: ThumbUmgebung['blender'] = null
    if (profile) {
      const config = ProfileStore.effective(profile)
      const spec = [BLENDER_PRIMARY, BLENDER_FALLBACK].find((s) => s.version === config.blenderVersion)
      const exe = spec ? await tools.exePath(spec) : null
      if (exe) blender = { exe, mesa: config.blenderMesa, geraet: config.final.engine === 'CYCLES' ? config.final.device : 'CPU', samples: Math.max(24, Math.min(64, config.final.samples)) }
    } else {
      // Ohne Hardware-Test: vorhandenes Blender vorsichtig nutzen (CPU, wenige Samples)
      for (const spec of [BLENDER_FALLBACK, BLENDER_PRIMARY]) {
        const exe = await tools.exePath(spec)
        if (exe) {
          blender = { exe, mesa: false, geraet: 'CPU', samples: 24 }
          break
        }
      }
    }
    if (brauchtBlender && !blender) throw new Error(t('thumb.fehlt.blender'))
    const root = werkzeugRoot()
    return { blender, uv: await tools.exePath(UV), pyDir: join(root, 'py', 'vorlage'), modelle: join(root, 'py', 'modelle'), skripte: resourceDir('blender'), prompts: resourceDir('prompts'), werkzeugRoot: root, mojangErlaubt: false }
  }

  const titelFuer = (p: ThumbPayload): string =>
    p.start.art === 'reaktion' ? `${t('thumb.art.reaktion')}: ${basename(p.start.quelle ?? '')}` : p.start.art === 'vorlage' ? `${t('thumb.art.vorlage')}: ${basename(p.start.quelle ?? '')}` : `${t('tab.thumbnail')}: ${p.start.beschreibung.slice(0, 50)}`

  const starte = async (roh: unknown): Promise<string> => {
    const start = ThumbStartSchema.parse(roh)
    const dir = await profil.datenordner()
    const beispiele = await ladeBeispiele(resourceDir('stilbuecher'))
    const vorab = (await profil.laden()).konten.find((k) => k.id === start.kontoId)
    const engine = start.engine ?? engineFuer(vorab?.darstellung ?? [])
    const p = await baueAuftrag(start, {
      store: profil,
      vorbilder,
      beispiele,
      umgebung: await umgebung(engine === 'minecraft' || engine === 'modell3d'),
      sprache: hauptSprache(),
      ausgabe: join(dir, 'thumbnails', `${start.art}-${randomUUID()}`)
    })
    const art = start.art === 'reaktion' ? 'reaktion' : start.art === 'vorlage' ? 'vorlage' : 'thumbnail'
    return queue.enqueue(art, titelFuer(p), p)
  }
  ipcMain.handle(IPC.thumbStart, (_e, roh: unknown) => starte(roh))

  ipcMain.handle(IPC.thumbDatei, async (_e, zweck: unknown): Promise<string | null> => {
    const video = zweck === 'video'
    return oeffnen({
      title: t(video ? 'thumb.dialog.video' : 'thumb.dialog.bild'),
      properties: ['openFile'],
      filters: [video ? { name: 'Video', extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm'] } : { name: t('thumb.dialog.bildTyp'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    })
  })

  ipcMain.handle(IPC.thumbAuftraege, (): ThumbAuftragInfo[] =>
    queue
      .state()
      .jobs.filter((j) => (['thumbnail', 'reaktion', 'vorlage', 'aenderung', 'video'] as string[]).includes(j.kind))
      .map((j) => ({ id: j.id, art: (j.kind === 'thumbnail' ? 'frei' : j.kind) as ThumbAuftragInfo['art'], titel: j.title, state: j.state, progress: j.progress, step: j.step, error: j.error ?? null, createdAt: j.createdAt }))
      .reverse()
  )

  const variante = (jobId: string, index: number): ThumbErgebnisDaten['varianten'][number] | undefined => queue.result<ThumbErgebnisDaten>(jobId)?.varianten[index]

  ipcMain.handle(IPC.thumbErgebnis, async (_e, jobId: unknown): Promise<VarianteInfo[] | null> => {
    const dir = await profil.datenordner()
    const res = queue.result<ThumbErgebnisDaten>(String(jobId))
    const p = queue.payload<ThumbPayload>(String(jobId))
    if (!res) return null
    const bekannte = p?.stil.vorbilder ?? []
    return Promise.all(
      res.varianten.map(async (v) => {
        const vb = bekannte.find((x) => x.id === v.vorbild)
        return {
          titel: v.titel,
          warum: v.warum,
          vorbild: vb ? { id: vb.id, titel: vb.titel || null, kanal: vb.kanal, link: vb.link } : null,
          bild: v.bild && imOrdner(dir, v.bild) ? await alsDataUrl(v.bild) : null,
          pruefung: v.pruefung,
          fehler: v.fehler
        }
      })
    )
  })

  ipcMain.handle(IPC.thumbAendern, async (_e, jobId: unknown, index: unknown, wunsch: unknown): Promise<string> => {
    const text = typeof wunsch === 'string' ? wunsch.trim() : ''
    if (!text) throw new Error(t('thumb.aendern.leer'))
    const id = String(jobId)
    let basis = queue.payload<ThumbPayload | AenderungPayload>(id)
    const v = variante(id, Number(index))
    if (!basis || !v?.bild) throw new Error(t('thumb.aendern.weg'))
    // Änderung einer Änderung: auf den ursprünglichen Auftrag zurückgehen
    let quelle = (basis as ThumbPayload).ausgabe
    let idx = Number(index)
    if ('basis' in basis) {
      quelle = basis.basis.ausgabe
      idx = 0
      basis = basis.basis
    }
    const b = basis as ThumbPayload
    if (b.start.art !== 'frei') throw new Error(t('thumb.aendern.nurFrei'))
    const ausgabe = join(await profil.datenordner(), 'thumbnails', `aenderung-${randomUUID()}`)
    const payload: AenderungPayload = { basis: { ...b, ausgabe }, quelle, index: idx, wunsch: text, bild: v.bild }
    // Die geänderte Variante bekommt ihre eigene plan.json im neuen Ordner (für weitere Änderungen)
    return queue.enqueue('aenderung', `${t('thumb.aendern.titel')}: ${text.slice(0, 50)}`, payload)
  })

  ipcMain.handle(IPC.thumbLoeschen, async (_e, jobId: unknown): Promise<void> => {
    const dir = await profil.datenordner()
    const p = (await queue.remove(String(jobId))) as { ausgabe?: string } | undefined
    if (p?.ausgabe && imOrdner(dir, p.ausgabe)) await rm(p.ausgabe, { recursive: true, force: true })
  })

  ipcMain.handle(IPC.thumbExport, async (_e, jobId: unknown, index: unknown, format: unknown, typ: unknown): Promise<string | null> => {
    const dir = await profil.datenordner()
    const v = variante(String(jobId), Number(index))
    if (!v?.bild || !imOrdner(dir, v.bild)) return null
    const psd = typ === 'psd'
    const endung = psd ? 'psd' : typ === 'jpg' ? 'jpg' : 'png'
    const fmt = (['16:9', '9:16', '1:1'] as ExportFormat[]).includes(format as ExportFormat) ? (format as ExportFormat) : '16:9'
    const name = `${v.titel.replace(/[\\/:*?"<>|]/g, '').slice(0, 60) || 'thumbnail'}${psd ? '' : `-${fmt.replace(':', 'x')}`}.${endung}`
    const win = fenster()
    const opts: Electron.SaveDialogOptions = { title: t('thumb.export.speichern'), defaultPath: name, filters: [{ name: endung.toUpperCase(), extensions: [endung] }] }
    const ziel = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (ziel.canceled || !ziel.filePath) return null
    if (psd) await exportierePsd(v.bild, v.ebenen, ziel.filePath)
    else {
      // Für den Neusatz des Texts: Werkzeuge und Marke des ursprünglichen Auftrags
      const roh = queue.payload<ThumbPayload | AenderungPayload>(String(jobId))
      const basis = roh && 'basis' in roh ? roh.basis : roh
      const ctx = stillerKontext()
      const pyU = !v.schriftAssets && basis?.umgebung.uv && fmt !== '16:9' ? await sicherePython(basis.umgebung, ctx).catch(() => null) : null
      await exportiereFormat({ v, format: fmt, typ: endung as 'png' | 'jpg', ziel: ziel.filePath, arbeit: join(dirname(v.bild), 'export'), umgebung: basis?.umgebung ?? null, py: pyU, marke: basis?.marke ?? { schrift: null, logo: null, farben: [] }, ctx })
    }
    shell.showItemInFolder(ziel.filePath)
    return ziel.filePath
  })

  // --- Vorbilder und Stilbuch ---
  ipcMain.handle(IPC.vorbildListe, (_e, kontoId: unknown): Promise<Vorbild[]> => vorbilder.liste(String(kontoId)))
  ipcMain.handle(IPC.vorbildHinzu, async (_e, kontoId: unknown, q: unknown): Promise<Vorbild[]> => {
    const k = String(kontoId)
    const quelle = (q ?? {}) as { art?: string; pfade?: string[]; url?: string }
    if (quelle.art === 'zwischenablage') {
      // Electron 44: asynchrone Zwischenablage nach W3C (ClipboardItem mit MIME-Typen)
      const eintrag = (await clipboard.read()).find((x) => x.types.includes('image/png'))
      if (!eintrag) throw new Error(t('thumb.vorbild.zwischenablageLeer'))
      const blob = (await eintrag.getType('image/png')) as Blob
      await vorbilder.hinzu(k, { art: 'zwischenablage', png: Buffer.from(await blob.arrayBuffer()) })
    } else if (quelle.art === 'link' && quelle.url) await vorbilder.hinzu(k, { art: 'link', url: quelle.url })
    else if (quelle.art === 'ablegen') for (const pfad of quelle.pfade ?? []) await vorbilder.hinzu(k, { art: 'ablegen', pfad })
    else {
      const win = fenster()
      const opts: Electron.OpenDialogOptions = { title: t('thumb.vorbild.waehlen'), properties: ['openFile', 'multiSelections'], filters: [{ name: t('thumb.dialog.bildTyp'), extensions: ['png', 'jpg', 'jpeg'] }] }
      const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
      for (const pfad of r.canceled ? [] : r.filePaths) await vorbilder.hinzu(k, { art: 'datei', pfad })
    }
    return vorbilder.liste(k)
  })
  ipcMain.handle(IPC.vorbildAendern, (_e, kontoId: unknown, id: unknown, patch: unknown) => vorbilder.aendere(String(kontoId), String(id), (patch ?? {}) as { aktiv?: boolean; gewicht?: number }))
  ipcMain.handle(IPC.vorbildLoeschen, (_e, kontoId: unknown, id: unknown) => vorbilder.loesche(String(kontoId), String(id)))
  ipcMain.handle(IPC.stilbuch, (_e, kontoId: unknown) => vorbilder.stilbuch(String(kontoId)))
  ipcMain.handle(IPC.stilbuchErstellen, async (_e, kontoId: unknown): Promise<string> => queue.enqueue('vorbild-analyse', t('thumb.vorbild.jobTitel'), { kontoId: String(kontoId) }))

  ipcMain.handle(IPC.thumbKiStand, async () => ({ ki: (await o.ki.kandidaten()).length > 0, bildKi: await o.ki.verfuegbar(true) }))

  // --- Aus dem Video ---
  const starteVideo = async (video: unknown, kontoId: unknown, titel?: unknown): Promise<string> => {
    const ffmpeg = await tools.exePath(FFMPEG)
    if (!ffmpeg) throw new Error(t('thumb.fehlt.ffmpeg'))
    const p = await profil.laden()
    const konto = p.konten.find((k) => k.id === kontoId)
    const payload: VideoPayload = {
      video: String(video),
      ffmpeg,
      ausgabe: join(await profil.datenordner(), 'thumbnails', `video-${randomUUID()}`),
      kanal: { name: konto?.name ?? '', richtungen: konto?.richtungen ?? [], sprache: konto?.sprache ?? 'de' },
      titel: typeof titel === 'string' && titel.trim() ? titel.trim() : null,
      freunde: p.freunde.map((f) => f.name).filter(Boolean),
      sprache: hauptSprache()
    }
    return queue.enqueue('video', `${t('thumb.art.video')}: ${basename(payload.video)}`, payload)
  }
  ipcMain.handle(IPC.thumbVideo, (_e, video: unknown, kontoId: unknown, titel: unknown) => starteVideo(video, kontoId, titel))
  ipcMain.handle(IPC.thumbVideoErgebnis, async (_e, jobId: unknown): Promise<(Omit<VideoErgebnis, 'momente'> & { momente: (VideoErgebnis['momente'][number] & { pfad: string | null })[] }) | null> => {
    const res = queue.result<VideoErgebnis>(String(jobId))
    if (!res) return null
    return { ...res, momente: await Promise.all(res.momente.map(async (m) => ({ ...m, pfad: m.bild, bild: m.bild ? await alsDataUrl(m.bild) : null }))) }
  })

  return { starte, starteVideo, vorbilder }
}
