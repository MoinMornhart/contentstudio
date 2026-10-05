// Herkunft: MoinStudio src/main/schnitt/ipc.ts (MIT), verallgemeinert auf Konten, KI-Schicht, Spuren und Plattformen.
import { videoDateiname, videoName } from '../dateinamen'
import { registerBibliothek } from './bibliothek-ipc'
import { aendereKarte, ladeKarten } from '../planung/karten'
import { dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { IPC } from '@shared/app'
import type { Konto } from '@shared/profil'
import type { Plattform } from '@shared/profil'
import { PLATTFORM_VORGABEN, type SchnittEffekt, type SchnittProjekt, type SpurArt } from '@shared/schnitt'
import type { JobContext, JobQueue } from '../jobs/queue'
import type { KiSchicht } from '../ki/schicht'
import type { ProfilStore } from '../profil/store'
import type { HardwareController } from '../hardware/controller'
import { ProfileStore } from '../hardware/profile'
import type { ToolManager } from '../tools/manager'
import { BLENDER_FALLBACK, BLENDER_PRIMARY, FFMPEG, UV } from '../tools/specs'
import { werkzeugRoot } from '../tools/ipc'
import { resourceDir } from '../resources'
import { t } from '../i18n'
import { liesMitKonfliktkopien } from '../data/jsonfile'
import { engineFuer, schriftPfad } from '../thumbnail/auftrag'
import { mcPfade } from '../thumbnail/minecraft/assets'
import type { ThumbUmgebung } from '../thumbnail/umgebung'
import { liesAbschnitte, transkriptJob, type Abschnitt, type TranskriptPayload } from './transkript'
import { rohschnittJob, type RohschnittPayload, type Schnittliste } from './rohschnitt'
import { bereichSetzen, umschalten, wunschJob, type WunschPayload } from './bearbeiten'
import { einstellungen, vorschauJob, type VorschauPayload } from './vorschau'
import { exportJob, kapitelText, type ExportErgebnis, type ExportPayload } from './export'
import { clipsJob, highlightJob, type ClipsPayload, type Highlight, type HighlightPayload } from './highlights'
import { importJob, type ImportPayload } from './import'
import { medienUrl } from './medien'
import type { EffektHilfe } from './effekt-vorbereitung'
import { aendereProjekt, ladeProjekt, ladeProjekte, loescheProjekt, projektOrdner, speichereProjekt, type Projekt } from './projekt'
import { spurJob, type SpurPayload } from './spuren'

/** Schnitt-Reiter (ROADMAP M5): Projekte, Import, Transkript, Rohschnitt, Wünsche, Vorschau, Export, Highlights. */

export const VIDEO_ENDUNGEN = ['mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'ts']
const TON_ENDUNGEN = ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg']

/** Richtung des Kontos für den Stil: erste Richtung, sonst das erste Spiel, sonst allgemein */
export function richtungAus(k: Konto): string {
  return k.richtungen[0] ?? (k.spiele.length ? 'gaming' : '')
}

/** Fachbegriffe für die Spracherkennung: Kanalname, Spiele, Richtungen */
export function begriffeAus(k: Konto): string {
  return [k.name.replace(/^@/, ''), ...k.spiele, ...k.richtungen].filter(Boolean).join(' ').slice(0, 400)
}

export function registerSchnittIpc(o: {
  queue: JobQueue
  profil: ProfilStore
  tools: ToolManager
  hardware: HardwareController
  ki: KiSchicht
  fenster: () => BrowserWindow | undefined
  /** Thumbnail aus dem Video (ROADMAP 4.9) */
  starteVideo: (video: string, kontoId: string, titel?: string) => Promise<string>
}): { starteImport: (video: string, kontoId: string) => Promise<string>; starteWunsch: (id: string, wunsch: string) => Promise<string>; aufruf: (kanal: string, ...a: unknown[]) => Promise<unknown> } {
  const { queue, profil, tools } = o
  const d = { ki: o.ki }
  queue.register('schnitt-import', importJob)
  queue.register('schnitt-transkript', transkriptJob)
  queue.register('schnitt-rohschnitt', (p: RohschnittPayload, ctx) => rohschnittJob(p, ctx, d))
  queue.register('schnitt-wunsch', (p: WunschPayload, ctx) => wunschJob(p, ctx, d))
  queue.register('schnitt-vorschau', vorschauJob)
  queue.register('schnitt-export', (p: ExportPayload, ctx) => exportJob(p, ctx as JobContext<unknown>, d))
  queue.register('schnitt-highlights', (p: HighlightPayload, ctx) => highlightJob(p, ctx, d))
  queue.register('schnitt-clips', clipsJob)
  queue.register('schnitt-spur', spurJob)

  // Jede Schnitt-Funktion ist über IPC (Oberfläche) und über aufruf() (MCP) erreichbar
  const methoden = new Map<string, (...a: unknown[]) => Promise<unknown>>()
  const biete = <A extends unknown[]>(kanal: string, fn: (...a: A) => unknown): void => {
    const f = async (...a: unknown[]): Promise<unknown> => fn(...(a as A))
    methoden.set(kanal, f)
    ipcMain.handle(kanal, (_e, ...a: unknown[]) => f(...a))
  }
  const daten = (): Promise<string> => profil.datenordner()
  const ffmpeg = async (): Promise<string> => {
    const f = await tools.exePath(FFMPEG)
    if (!f) throw new Error(t('thumb.fehlt.ffmpeg'))
    return f
  }
  const oeffnen = async (optionen: Electron.OpenDialogOptions): Promise<string | null> => {
    const win = o.fenster()
    const r = win ? await dialog.showOpenDialog(win, optionen) : await dialog.showOpenDialog(optionen)
    return r.canceled ? null : (r.filePaths[0] ?? null)
  }
  registerBibliothek({ biete, daten, ffmpeg, oeffnen })
  // Umbenennen: der Name gilt für Export, Shorts und Schnittprogramme; ein gewählter Namensvorschlag wird zusätzlich
  // Titel – im letzten Export und auf der verknüpften Planungskarte (aus MoinStudio v0.38.0)
  biete(IPC.schnittUmbenennen, async (id: unknown, name: unknown, titel: unknown): Promise<void> => {
    const neu = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, 120) : ''
    if (!neu) throw new Error(t('schnitt.fehler.nameLeer'))
    const ordnerDaten = await daten()
    const p = await aendereProjekt(ordnerDaten, String(id), () => ({ name: neu, ...(titel === true ? { titelGewaehlt: neu } : {}) }))
    if (!p) throw new Error(t('schnitt.fehler.projekt'))
    if (titel !== true) return
    const datei = join(projektOrdner(ordnerDaten, p.id), 'export.json')
    const e = JSON.parse(await readFile(datei, 'utf8').catch(() => 'null')) as ExportErgebnis | null
    if (e) await writeFile(datei, JSON.stringify({ ...e, titel: [neu, ...e.titel.filter((x) => x !== neu)] }, null, 1))
    const karte = (await ladeKarten(ordnerDaten)).find((k) => k.schnitt === p.id)
    if (karte) await aendereKarte(ordnerDaten, karte.id, { titel: neu, ...(karte.texte ? { texte: { ...karte.texte, titel: neu } } : {}) })
  })
  const umgebung = async (): Promise<ThumbUmgebung> => {
    const root = werkzeugRoot()
    return { blender: null, uv: await tools.exePath(UV), pyDir: join(root, 'py', 'vorlage'), modelle: join(root, 'py', 'modelle'), skripte: resourceDir('blender'), prompts: resourceDir('prompts'), werkzeugRoot: root, mojangErlaubt: false }
  }

  /** Blender laut Hardware-Profil und der Minecraft-Skin des Kontos für den Skin-Sting; fehlt eins, gibt es keinen Sting */
  const stingHilfe = async (konto: Konto, texturen: string): Promise<EffektHilfe['sting']> => {
    const d = konto.darstellung.find((x) => x.art === 'spielavatar' && x.spiel.toLowerCase() === 'minecraft' && x.skin)
    if (!d || d.art !== 'spielavatar' || !d.skin) return undefined
    const hw = await o.hardware.profiles.load()
    if (!hw) return undefined
    const config = ProfileStore.effective(hw)
    const spec = [BLENDER_PRIMARY, BLENDER_FALLBACK].find((s) => s.version === config.blenderVersion)
    const exe = spec ? await o.tools.exePath(spec) : null
    if (!exe) return undefined
    return {
      blender: { exe, mesa: config.blenderMesa, geraet: config.final.engine === 'CYCLES' ? config.final.device : 'CPU' },
      blenderDir: resourceDir('blender'),
      texturen,
      figur: { skin: await profil.absolut(d.skin), slim: d.slim },
      samples: Math.max(12, Math.min(32, Math.round(config.final.samples / 2)))
    }
  }

  /** Effekt-Hilfe: Markenschrift, bei Minecraft-Kanälen die Pixelschrift aus der Spieldatei (falls schon entpackt) */
  const effektHilfe = async (p: Projekt, ff: string): Promise<EffektHilfe> => {
    const pr = await profil.laden()
    const konto = pr.konten.find((k) => k.id === p.kontoId)
    const root = werkzeugRoot()
    const python = join(root, 'py', 'vorlage', 'Scripts', 'python.exe')
    let minecraftAssets: string | null = null
    let sting: EffektHilfe['sting']
    if (konto && engineFuer(konto.darstellung) === 'minecraft') {
      const alt = JSON.parse(await readFile(join(root, 'mc', 'aktuell.json'), 'utf8').catch(() => '{}')) as { version?: string }
      const pfad = alt.version ? mcPfade(join(root, 'mc'), alt.version, 'zwischenspeicher') : null
      if (pfad && existsSync(join(pfad.assets, 'font'))) minecraftAssets = pfad.assets
      // Skin-Sting im Intro (aus MoinStudio v0.45.0): nur mit Skin des Kontos, Spieldatei und Blender
      sting = pfad && existsSync(pfad.textures) ? await stingHilfe(konto, pfad.textures).catch(() => undefined) : undefined
    }
    const schriftDatei = pr.marke.schrift?.datei ? await profil.absolut(pr.marke.schrift.datei).catch(() => null) : null
    return { ffmpeg: ff, python: existsSync(python) ? python : null, skripte: resourceDir('blender'), lokal: root, schrift: schriftPfad(pr.marke.schrift?.name ?? null, schriftDatei), schriftName: pr.marke.schrift?.name ?? null, minecraftAssets, ...(sting ? { sting } : {}) }
  }

  const alsAnsicht = (ordnerDaten: string, p: Projekt): SchnittProjekt => {
    const ordner = projektOrdner(ordnerDaten, p.id)
    const job = (p.auftraege ?? []).map((a) => queue.get(a)).find((j) => j && j.state !== 'done' && j.state !== 'cancelled')
    return {
      id: p.id,
      name: p.name,
      kontoId: p.kontoId,
      kanal: p.kanal,
      plattform: p.plattform,
      richtung: p.richtung,
      erstellt: p.erstellt,
      quelle: p.quelle ? { pfad: p.quelle.pfad, dauer: p.quelle.dauer, breite: p.quelle.breite, hoehe: p.quelle.hoehe, fps: p.quelle.fps, groesse: p.quelle.groesse, audio: p.quelle.audio } : null,
      spuren: p.spuren ?? [],
      proxyUrl: p.proxy ? medienUrl(join(ordner, 'proxy.mp4')) : null,
      leisteUrl: p.leiste ? medienUrl(join(ordner, 'leiste.jpg')) : null,
      wellenform: p.wellenform,
      transkript: !!p.transkript,
      rohschnitt: !!p.rohschnitt,
      einstellungen: einstellungen(p),
      exportiert: !!p.export,
      highlights: p.highlights ?? null,
      clipsStand: p.clips ?? null,
      antwort: p.antwort ?? null,
      vorschauUrl: p.vorschau ? `${medienUrl(join(ordner, 'vorschau.mp4'))}?v=${p.vorschau}` : null,
      auftrag: job && job.state !== 'done' ? { state: job.state, progress: job.progress, step: job.step, error: job.error ?? null } : null
    }
  }

  const merkeAuftrag = async (id: string, art: string, titel: string, payload: unknown): Promise<string> => {
    const auftrag = await queue.enqueue(art, titel, payload)
    await aendereProjekt(await daten(), id, (x) => ({ auftraege: [...(x.auftraege ?? []), auftrag] }))
    return auftrag
  }

  const starteImport = async (video: string, kontoId: string): Promise<string> => {
    const ordnerDaten = await daten()
    const ff = await ffmpeg()
    const konto = (await profil.laden()).konten.find((k) => k.id === kontoId)
    if (!konto) throw new Error(t('thumb.auftrag.keinKonto'))
    const id = randomUUID().slice(0, 8)
    const vorgabe = PLATTFORM_VORGABEN[konto.plattform]
    const projekt: Projekt = {
      id,
      name: basename(video, extname(video)),
      kontoId: konto.id,
      kanal: konto.name || t('konten.unbenannt'),
      plattform: konto.plattform,
      sprache: konto.sprache,
      richtung: richtungAus(konto),
      erstellt: new Date().toISOString(),
      quelle: { pfad: video, groesse: 0, pruefsumme: '', dauer: 0, breite: 0, hoehe: 0, fps: 0, audio: false },
      spuren: [],
      proxy: false,
      wellenform: false,
      leiste: false,
      einstellungen: { format: vorgabe.format === '9:16' ? '9:16' : '16:9' }
    }
    await speichereProjekt(ordnerDaten, projekt)
    const payload: ImportPayload = { daten: ordnerDaten, projekt: id, ffmpeg: ff, ffprobe: join(dirname(ff), 'ffprobe.exe') }
    await merkeAuftrag(id, 'schnitt-import', t('schnitt.titel.import', { name: projekt.name }), payload)
    // Rohvideo rein, fertiges Video raus: Transkript und Rohschnitt starten danach von selbst
    await starteTranskript(id)
    return id
  }

  const starteTranskript = async (id: string): Promise<string> => {
    const ordnerDaten = await daten()
    const projekt = await ladeProjekt(ordnerDaten, id)
    if (!projekt) throw new Error(t('schnitt.fehler.projekt'))
    const ff = await ffmpeg()
    const uv = await tools.exePath(UV)
    if (!uv) throw new Error(t('thumb.fehlt.uv'))
    const hwProfil = await o.hardware.profiles.load()
    const whisper = hwProfil ? ProfileStore.effective(hwProfil).whisper : { model: 'small' as const, device: 'cpu' as const, compute: 'int8' as const }
    const konto = (await profil.laden()).konten.find((k) => k.id === projekt.kontoId)
    const root = werkzeugRoot()
    const payload: TranskriptPayload = { daten: ordnerDaten, projekt: id, ffmpeg: ff, uv, pyDir: join(root, 'py', 'vorlage'), skript: join(resourceDir('blender'), 'transkript.py'), whisper, lokal: root, sprache: projekt.sprache || 'auto', begriffe: konto ? begriffeAus(konto) : '' }
    const auftrag = await merkeAuftrag(id, 'schnitt-transkript', t('schnitt.titel.transkript', { name: projekt.name }), payload)
    await starteRohschnitt(id)
    return auftrag
  }

  const starteRohschnitt = async (id: string): Promise<string> => {
    const ordnerDaten = await daten()
    const projekt = await ladeProjekt(ordnerDaten, id)
    if (!projekt) throw new Error(t('schnitt.fehler.projekt'))
    const payload: RohschnittPayload = { daten: ordnerDaten, projekt: id }
    return merkeAuftrag(id, 'schnitt-rohschnitt', t('schnitt.titel.rohschnitt', { name: projekt.name }), payload)
  }

  const starteVorschau = async (id: unknown): Promise<string> => {
    const ordnerDaten = await daten()
    const ff = await ffmpeg()
    const p = await ladeProjekt(ordnerDaten, String(id))
    if (!p) throw new Error(t('schnitt.fehler.projekt'))
    const payload: VorschauPayload = { daten: ordnerDaten, projekt: p.id, ffmpeg: ff, hilfe: await effektHilfe(p, ff), umgebung: await umgebung() }
    return merkeAuftrag(p.id, 'schnitt-vorschau', t('schnitt.titel.vorschau', { name: p.name }), payload)
  }

  const starteWunsch = async (id: unknown, wunsch: unknown): Promise<string> => {
    const text = typeof wunsch === 'string' ? wunsch.trim() : ''
    if (!text) throw new Error(t('thumb.aendern.leer'))
    const ordnerDaten = await daten()
    const pr = await profil.laden()
    const kontoId = (await ladeProjekt(ordnerDaten, String(id)))?.kontoId
    const konto = pr.konten.find((k) => k.id === kontoId)
    const sting = !!konto && engineFuer(konto.darstellung) === 'minecraft' && konto.darstellung.some((x) => x.art === 'spielavatar' && !!x.skin)
    const payload: WunschPayload = { daten: ordnerDaten, projekt: String(id), wunsch: text, ffmpeg: (await tools.exePath(FFMPEG)) ?? undefined, schrift: pr.marke.schrift?.name ?? null, sting }
    const auftrag = await merkeAuftrag(String(id), 'schnitt-wunsch', t('schnitt.titel.wunsch', { wunsch: text.slice(0, 40) }), payload)
    // danach gleich die Vorschau, damit man das Ergebnis sieht
    void queue.waitFor(auftrag).then((j) => (j.state === 'done' ? starteVorschau(id) : null)).catch(() => undefined)
    return auftrag
  }

  biete(IPC.schnittProjekte, async (): Promise<SchnittProjekt[]> => {
    const ordnerDaten = await daten()
    return (await ladeProjekte(ordnerDaten)).filter((p) => p.kontoId).map((p) => alsAnsicht(ordnerDaten, p))
  })
  biete(IPC.schnittImport, async (kontoId: unknown): Promise<string | null> => {
    const video = await oeffnen({ title: t('schnitt.dialog.video'), filters: [{ name: 'Video', extensions: VIDEO_ENDUNGEN }], properties: ['openFile'] })
    return video ? starteImport(video, String(kontoId ?? '')) : null
  })
  biete(IPC.schnittWellenform, async (id: unknown): Promise<{ aufloesung: number; werte: number[] } | null> => {
    const p = await ladeProjekt(await daten(), String(id))
    if (!p?.wellenform) return null
    return JSON.parse(await readFile(join(projektOrdner(await daten(), p.id), 'wellenform.json'), 'utf8')) as { aufloesung: number; werte: number[] }
  })
  biete(IPC.schnittTranskript, async (id: unknown): Promise<Abschnitt[] | null> => {
    const text = await readFile(join(projektOrdner(await daten(), String(id)), 'transkript.jsonl'), 'utf8').catch(() => null)
    return text === null ? null : liesAbschnitte(text)
  })
  biete(IPC.schnittTranskriptStart, async (id: unknown) => starteTranskript(String(id)))
  biete(IPC.schnittRohschnittStart, async (id: unknown) => starteRohschnitt(String(id)))
  const aendereListe = async (id: string, f: (l: Schnittliste) => Schnittliste): Promise<Schnittliste> => {
    const datei = join(projektOrdner(await daten(), id), 'schnitt.json')
    const neu = f(JSON.parse(await liesMitKonfliktkopien(datei)) as Schnittliste)
    await writeFile(datei, JSON.stringify(neu, null, 1))
    return neu
  }
  biete(IPC.schnittUmschalten, (id: unknown, index: unknown) => aendereListe(String(id), (l) => umschalten(l, Number(index))))
  biete(IPC.schnittBereich, (id: unknown, start: unknown, ende: unknown, raus: unknown, text: unknown) =>
    aendereListe(String(id), (l) => bereichSetzen(l, Number(start), Number(ende), raus === true, typeof text === 'string' ? text : undefined))
  )
  biete(IPC.schnittWunsch, (id: unknown, wunsch: unknown) => starteWunsch(id, wunsch))
  biete(IPC.schnittEinstellungen, async (id: unknown, patch: unknown) => {
    const q = (patch ?? {}) as { untertitel?: string; zooms?: boolean; format?: string; richtung?: string; plattform?: string }
    await aendereProjekt(await daten(), String(id), (p) => ({
      einstellungen: {
        ...p.einstellungen,
        ...(q.untertitel === 'aus' || q.untertitel === 'an' || q.untertitel === 'karaoke' ? { untertitel: q.untertitel } : {}),
        ...(typeof q.zooms === 'boolean' ? { zooms: q.zooms } : {}),
        ...(q.format === '16:9' || q.format === '9:16' ? { format: q.format } : {})
      },
      ...(typeof q.richtung === 'string' ? { richtung: q.richtung.trim().slice(0, 60) } : {}),
      ...(typeof q.plattform === 'string' && q.plattform in PLATTFORM_VORGABEN ? { plattform: q.plattform as Plattform } : {})
    }))
  })
  biete(IPC.schnittVorschau, starteVorschau)
  // Effektliste: so wie gespeichert (Originalzeit), auch ausgeschaltete
  const effektDatei = async (id: unknown): Promise<string> => join(projektOrdner(await daten(), String(id)), 'effekte.json')
  biete(IPC.schnittEffekte, async (id: unknown): Promise<SchnittEffekt[]> => JSON.parse(await liesMitKonfliktkopien(await effektDatei(id)).catch(() => '[]')) as SchnittEffekt[])
  biete(IPC.schnittEffektAendern, async (id: unknown, index: unknown, aenderung: unknown): Promise<SchnittEffekt[]> => {
    const datei = await effektDatei(id)
    const liste = JSON.parse(await liesMitKonfliktkopien(datei).catch(() => '[]')) as SchnittEffekt[]
    const i = Number(index)
    if (!liste[i]) throw new Error(t('schnitt.fehler.effekt'))
    if (aenderung === null) liste.splice(i, 1)
    else liste[i] = { ...liste[i], aus: !!(aenderung as { aus?: boolean }).aus }
    await writeFile(datei, JSON.stringify(liste, null, 1))
    return liste
  })
  // Spuren (ROADMAP 5.6)
  biete(IPC.schnittSpurHinzu, async (id: unknown, art: unknown): Promise<string | null> => {
    const a: SpurArt = art === 'ton' ? 'ton' : art === 'gameplay' ? 'gameplay' : 'facecam'
    const datei = await oeffnen({ title: t('schnitt.dialog.spur'), filters: [{ name: a === 'ton' ? 'Audio' : 'Video', extensions: a === 'ton' ? [...TON_ENDUNGEN, ...VIDEO_ENDUNGEN] : VIDEO_ENDUNGEN }], properties: ['openFile'] })
    if (!datei) return null
    const ordnerDaten = await daten()
    const ff = await ffmpeg()
    const neu = await aendereProjekt(ordnerDaten, String(id), (p) => ({ spuren: [...(p.spuren ?? []), { pfad: datei, art: a, versatz: null, sicherheit: null, dauer: 0 }] }))
    if (!neu) throw new Error(t('schnitt.fehler.projekt'))
    const payload: SpurPayload = { daten: ordnerDaten, projekt: neu.id, index: (neu.spuren ?? []).length - 1, ffmpeg: ff, ffprobe: join(dirname(ff), 'ffprobe.exe') }
    return merkeAuftrag(neu.id, 'schnitt-spur', t('schnitt.titel.spur', { name: basename(datei) }), payload)
  })
  biete(IPC.schnittSpurAendern, async (id: unknown, index: unknown, aenderung: unknown) => {
    const i = Number(index)
    await aendereProjekt(await daten(), String(id), (p) => ({
      spuren: aenderung === null ? (p.spuren ?? []).filter((_, j) => j !== i) : (p.spuren ?? []).map((s, j) => (j === i ? { ...s, versatz: Number((aenderung as { versatz?: number }).versatz ?? s.versatz ?? 0) } : s))
    }))
  })
  // Export je Plattform (ROADMAP 5.7)
  biete(IPC.schnittExport, async (id: unknown): Promise<string> => {
    const ordnerDaten = await daten()
    const ff = await ffmpeg()
    const p = await ladeProjekt(ordnerDaten, String(id))
    if (!p) throw new Error(t('schnitt.fehler.projekt'))
    const hwProfil = await o.hardware.profiles.load()
    const payload: ExportPayload = { daten: ordnerDaten, projekt: p.id, ffmpeg: ff, ffprobe: join(dirname(ff), 'ffprobe.exe'), encoder: hwProfil ? ProfileStore.effective(hwProfil).encoder : 'libx264', hilfe: await effektHilfe(p, ff), umgebung: await umgebung() }
    return merkeAuftrag(p.id, 'schnitt-export', t('schnitt.titel.export', { name: p.name }), payload)
  })
  biete(IPC.schnittExportInfo, async (id: unknown) => {
    const text = await readFile(join(projektOrdner(await daten(), String(id)), 'export.json'), 'utf8').catch(() => null)
    if (!text) return null
    const e = JSON.parse(text) as ExportErgebnis
    const p = await ladeProjekt(await daten(), String(id))
    return { ...e, url: `${medienUrl(e.datei)}?v=${p?.export ?? 0}`, kapitelText: kapitelText(e.kapitel) }
  })
  biete(IPC.schnittExportSpeichern, async (id: unknown): Promise<string | null> => {
    const ordnerDaten = await daten()
    const p = await ladeProjekt(ordnerDaten, String(id))
    const info = JSON.parse(await readFile(join(projektOrdner(ordnerDaten, String(id)), 'export.json'), 'utf8').catch(() => 'null')) as ExportErgebnis | null
    if (!p?.export || !info) return null
    const endung = extname(info.datei).slice(1)
    const win = o.fenster()
    const opts: Electron.SaveDialogOptions = { title: t('schnitt.dialog.speichern'), defaultPath: videoDateiname(videoName({ name: p.name, quelle: p.quelle?.pfad }), endung), filters: [{ name: endung.toUpperCase(), extensions: [endung] }] }
    const wahl = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (wahl.canceled || !wahl.filePath) return null
    await copyFile(info.datei, wahl.filePath)
    // Titel, Beschreibung und Kapitel gleich benannt daneben (Video.mp4 → Video.txt), fertig zum Einfügen (aus MoinStudio v0.38.0)
    const text = [info.titel[0] ?? p.name, '', info.beschreibung, ...(info.kapitel.length ? ['', kapitelText(info.kapitel)] : [])].join('\r\n')
    await writeFile(wahl.filePath.replace(/\.[^.\\/]+$/, '') + '.txt', text, 'utf8')
    shell.showItemInFolder(wahl.filePath)
    return wahl.filePath
  })
  // Übergabe ans Thumbnail: das fertige Video ansehen und Thumbnails vorschlagen
  biete(IPC.schnittThumbnail, async (id: unknown): Promise<string> => {
    const ordnerDaten = await daten()
    const p = await ladeProjekt(ordnerDaten, String(id))
    if (!p?.quelle) throw new Error(t('schnitt.fehler.projekt'))
    const info = p.export ? (JSON.parse(await readFile(join(projektOrdner(ordnerDaten, p.id), 'export.json'), 'utf8')) as ExportErgebnis) : null
    return o.starteVideo(info && !info.datei.endsWith('.m4a') ? info.datei : p.quelle.pfad, p.kontoId, info?.titel[0] ?? p.name)
  })
  // Highlights und Shorts
  biete(IPC.schnittHighlightsStart, async (id: unknown): Promise<string> => {
    const p = await ladeProjekt(await daten(), String(id))
    if (!p) throw new Error(t('schnitt.fehler.projekt'))
    const payload: HighlightPayload = { daten: await daten(), projekt: p.id }
    return merkeAuftrag(p.id, 'schnitt-highlights', t('schnitt.titel.highlights', { name: p.name }), payload)
  })
  biete(IPC.schnittHighlights, async (id: unknown): Promise<Highlight[] | null> => {
    const text = await readFile(join(projektOrdner(await daten(), String(id)), 'highlights.json'), 'utf8').catch(() => null)
    return text === null ? null : (JSON.parse(text) as Highlight[])
  })
  biete(IPC.schnittClips, async (id: unknown, auswahl: unknown): Promise<string> => {
    const p = await ladeProjekt(await daten(), String(id))
    const ff = await ffmpeg()
    if (!p) throw new Error(t('schnitt.fehler.projekt'))
    const hwProfil = await o.hardware.profiles.load()
    const liste = (Array.isArray(auswahl) ? auswahl : []).filter((a): a is { index: number; art: 'clip' | 'short' } => typeof a?.index === 'number' && (a.art === 'clip' || a.art === 'short'))
    if (!liste.length) throw new Error(t('schnitt.fehler.nichtsGewaehlt'))
    const payload: ClipsPayload = { daten: await daten(), projekt: p.id, ffmpeg: ff, encoder: hwProfil ? ProfileStore.effective(hwProfil).encoder : 'libx264', umgebung: await umgebung(), auswahl: liste }
    return merkeAuftrag(p.id, 'schnitt-clips', t('schnitt.titel.clips', { name: p.name, anzahl: liste.length }), payload)
  })
  biete(IPC.schnittClipDateien, async (id: unknown): Promise<{ name: string; url: string }[]> => {
    const p = await ladeProjekt(await daten(), String(id))
    const ordner = join(projektOrdner(await daten(), String(id)), 'clips')
    const namen = (await readdir(ordner).catch(() => [] as string[])).filter((n) => n.endsWith('.mp4')).sort()
    return namen.map((n) => ({ name: n, url: `${medienUrl(join(ordner, n))}?v=${p?.clips ?? 0}` }))
  })
  biete(IPC.schnittClipOrdner, async (id: unknown): Promise<void> => {
    await shell.openPath(join(projektOrdner(await daten(), String(id)), 'clips'))
  })
  biete(IPC.schnittListe, async (id: unknown): Promise<Schnittliste | null> => {
    const text = await liesMitKonfliktkopien(join(projektOrdner(await daten(), String(id)), 'schnitt.json')).catch(() => null)
    return text === null ? null : (JSON.parse(text) as Schnittliste)
  })
  biete(IPC.schnittLoeschen, async (id: unknown): Promise<void> => {
    const p = await ladeProjekt(await daten(), String(id))
    for (const a of p?.auftraege ?? []) await queue.remove(a)
    await loescheProjekt(await daten(), String(id))
  })
  const aufruf = async (kanal: string, ...a: unknown[]): Promise<unknown> => {
    const f = methoden.get(kanal)
    if (!f) throw new Error(`unknown ${kanal}`)
    return f(...a)
  }
  return { starteImport, starteWunsch, aufruf }
}
