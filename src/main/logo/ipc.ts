// Herkunft: MoinStudio src/main/logo/ipc.ts (MIT), v0.38.0 – Konten, KI-Schicht und Bibliothek im Creator-Profil.
import { dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { IPC } from '@shared/app'
import { LOGO_EXPORTE, LogoStartSchema, type LogoAuftragInfo, type LogoEintrag, type LogoExport, type LogoVarianteInfo } from '@shared/logo'
import { dekodiere, kodierePng, liesBild } from '../bild/rohbild'
import { skaliere } from '../bild/komposit'
import type { JobQueue } from '../jobs/queue'
import type { KiSchicht } from '../ki/schicht'
import type { ProfilStore } from '../profil/store'
import { hauptSprache, t } from '../i18n'
import { engineFuer, schriftPfad } from '../thumbnail/auftrag'
import { alsDataUrl, imOrdner } from '../thumbnail/ipc'
import type { ThumbUmgebung } from '../thumbnail/umgebung'
import { aendereLogo, ladeLogos, neuesLogo } from './bibliothek'
import { aufQuadrat, exportGroesse, freistellen, hatTransparenz, zuschneiden } from './bild'
import { logoAenderungJob, logoJob, type LogoAenderungPayload, type LogoPayload, type LogoVariante } from './job'

/**
 * Reiter „Logo“: Logos erstellen und ändern (Aufträge mit Verlauf wie beim Thumbnail), hochladen, Bibliothek
 * (umbenennen, löschen, Standard je Konto) und Export als PNG in mehreren Größen oder als YouTube-Wasserzeichen.
 */

export const LOGO_JOBS = ['logo', 'logo-aenderung'] as const

export function registerLogoIpc(o: { queue: JobQueue; profil: ProfilStore; ki: KiSchicht; umgebung: (brauchtBlender: boolean) => Promise<ThumbUmgebung>; fenster: () => BrowserWindow | undefined }): { starteLogo: (roh: unknown) => Promise<string> } {
  const { queue, profil } = o
  const d = { ki: o.ki }
  queue.register('logo', (p: LogoPayload, ctx) => logoJob(p, ctx as never, d))
  queue.register('logo-aenderung', (p: LogoAenderungPayload, ctx) => logoAenderungJob(p, ctx, d))

  /** Bauart, Köpfe (Creator zuerst, dann Freunde mit Minecraft-Skin), Schrift und Farben der Marke für ein Konto */
  const grundlage = async (kontoId: string): Promise<Omit<LogoPayload, 'beschreibung' | 'anzahl' | 'ausgabe'>> => {
    const p = await profil.laden()
    const konto = p.konten.find((k) => k.id === kontoId)
    if (!konto) throw new Error(t('logo.fehlt.konto'))
    const bauart = engineFuer(konto.darstellung) === 'minecraft' ? 'minecraft' : 'schrift'
    const skin = async (darstellung: typeof konto.darstellung): Promise<string | null> => {
      const d = darstellung.find((x) => x.art === 'spielavatar' && x.spiel.toLowerCase() === 'minecraft' && x.skin)
      return d && d.art === 'spielavatar' && d.skin ? profil.absolut(d.skin) : null
    }
    const koepfe: LogoPayload['koepfe'] = []
    if (bauart === 'minecraft') {
      const eigen = await skin(konto.darstellung)
      if (eigen) koepfe.push({ name: konto.name.replace(/^@/, '') || 'ich', datei: eigen })
      for (const f of p.freunde) {
        const s = await skin(f.darstellung)
        if (s && f.name) koepfe.push({ name: f.name, datei: s })
      }
    }
    return {
      kanal: { id: konto.id, name: konto.name, plattform: t(`plattform.${konto.plattform}`), richtungen: konto.richtungen, sprache: konto.sprache },
      bauart,
      koepfe,
      schrift: schriftPfad(p.marke.schrift?.name ?? null, p.marke.schrift?.datei ? await profil.absolut(p.marke.schrift.datei) : null),
      farben: p.marke.farben,
      umgebung: { ...(await o.umgebung(bauart === 'minecraft')), mojangErlaubt: p.einstellungen.minecraftBesitz },
      sprache: hauptSprache()
    }
  }

  const starteLogo = async (roh: unknown): Promise<string> => {
    const start = LogoStartSchema.parse(roh)
    const g = await grundlage(start.kontoId)
    const payload: LogoPayload = { ...g, beschreibung: start.beschreibung, anzahl: start.anzahl, ausgabe: join(await profil.datenordner(), 'logos', `logo-${randomUUID()}`) }
    return queue.enqueue('logo', `${t('logo.titel')}: ${start.beschreibung.slice(0, 50)}`, payload)
  }
  ipcMain.handle(IPC.logoStart, (_e, roh: unknown) => starteLogo(roh))

  const variante = (jobId: string, index: number): LogoVariante | undefined => queue.result<{ varianten: LogoVariante[] }>(jobId)?.varianten[index]

  ipcMain.handle(IPC.logoAendern, async (_e, jobId: unknown, index: unknown, wunsch: unknown): Promise<string> => {
    const text = typeof wunsch === 'string' ? wunsch.trim() : ''
    if (!text) throw new Error(t('thumb.aendern.leer'))
    const id = String(jobId)
    const v = variante(id, Number(index))
    const basis = queue.payload<LogoPayload | LogoAenderungPayload>(id)
    if (!basis || !v?.bild) throw new Error(t('thumb.aendern.weg'))
    const g = await grundlage(basis.kanal.id)
    const eltern = 'eltern' in basis ? basis.eltern : id
    const payload: LogoAenderungPayload = { ...g, wunsch: text, eltern, basis: { job: id, variante: Number(index) }, bild: v.bild, szene: v.szene, ausgabe: join(await profil.datenordner(), 'logos', `aenderung-${randomUUID()}`) }
    return queue.enqueue('logo-aenderung', `${t('thumb.aendern.titel')}: ${text.slice(0, 50)}`, payload)
  })

  ipcMain.handle(IPC.logoAuftraege, (): LogoAuftragInfo[] =>
    queue
      .state()
      .jobs.filter((j) => (LOGO_JOBS as readonly string[]).includes(j.kind))
      .map((j) => {
        const a = j.kind === 'logo-aenderung' ? queue.payload<LogoAenderungPayload>(j.id) : undefined
        return { id: j.id, art: j.kind as LogoAuftragInfo['art'], titel: j.title, state: j.state, progress: j.progress, step: j.step, error: j.error ?? null, createdAt: j.createdAt, ...(a ? { eltern: a.eltern, wunsch: a.wunsch } : {}) }
      })
      .reverse()
  )

  ipcMain.handle(IPC.logoErgebnis, async (_e, jobId: unknown): Promise<LogoVarianteInfo[] | null> => {
    const dir = await profil.datenordner()
    const res = queue.result<{ varianten: LogoVariante[] }>(String(jobId))
    if (!res) return null
    return Promise.all(res.varianten.map(async (v) => ({ titel: v.titel, bild: v.bild && imOrdner(dir, v.bild) ? await alsDataUrl(v.bild) : null, warnungen: v.warnungen, fehler: v.fehler ?? null, bauart: v.bauart })))
  })

  // Löschen wie beim Thumbnail: Ursprungsauftrag mit allen Änderungen aus seinem Verlauf
  ipcMain.handle(IPC.logoLoeschen, async (_e, jobId: unknown): Promise<void> => {
    const dir = await profil.datenordner()
    const id = String(jobId)
    const verlauf = queue
      .state()
      .jobs.filter((j) => j.kind === 'logo-aenderung' && queue.payload<LogoAenderungPayload>(j.id)?.eltern === id)
      .map((j) => j.id)
    for (const x of [id, ...verlauf]) {
      const p = (await queue.remove(x)) as { ausgabe?: string } | undefined
      if (p?.ausgabe && imOrdner(dir, p.ausgabe)) await rm(p.ausgabe, { recursive: true, force: true })
    }
  })

  // --- Bibliothek ---
  ipcMain.handle(IPC.logoListe, (): Promise<LogoEintrag[]> => ladeLogos(profil))
  ipcMain.handle(IPC.logoBild, async (_e, id: unknown): Promise<string | null> => {
    const l = (await ladeLogos(profil)).find((x) => x.id === id)
    return l ? profil.bildUrl(l.datei) : null
  })
  ipcMain.handle(IPC.logoEintrag, (_e, id: unknown, patch: unknown) => aendereLogo(profil, String(id), (patch ?? {}) as Parameters<typeof aendereLogo>[2]))

  // Hochladen: die Oberfläche schickt ein PNG (SVG, JPG und WebP hat sie schon umgewandelt); ohne Transparenz wird freigestellt
  ipcMain.handle(IPC.logoHochladen, async (_e, name: unknown, png: unknown): Promise<LogoEintrag[]> => {
    const daten = typeof png === 'string' ? Buffer.from(png.replace(/^data:image\/\w+;base64,/, ''), 'base64') : Buffer.alloc(0)
    let bild
    try {
      bild = dekodiere(daten)
    } catch {
      throw new Error(t('logo.fehlt.bild'))
    }
    if (!hatTransparenz(bild)) bild = freistellen(bild)
    bild = zuschneiden(bild, 2)
    return neuesLogo(profil, kodierePng(bild), { name: String(name ?? 'Logo'), quelle: 'hochgeladen' })
  })

  ipcMain.handle(IPC.logoMerken, async (_e, jobId: unknown, index: unknown, name: unknown): Promise<LogoEintrag[]> => {
    const dir = await profil.datenordner()
    const v = variante(String(jobId), Number(index))
    if (!v?.bild || !imOrdner(dir, v.bild)) throw new Error(t('thumb.aendern.weg'))
    return neuesLogo(profil, await readFile(v.bild), { name: String(name ?? v.titel), quelle: 'erstellt' })
  })

  // Export: längste Seite 512/1024/2048 oder YouTube-Wasserzeichen (150 × 150, quadratisch, durchsichtig)
  ipcMain.handle(IPC.logoExport, async (_e, quelle: unknown, groesse: unknown): Promise<string | null> => {
    const dir = await profil.datenordner()
    const q = (quelle ?? {}) as { logo?: string; job?: string; variante?: number }
    let pfad: string | null = null
    let name = 'logo'
    if (q.logo) {
      const l = (await ladeLogos(profil)).find((x) => x.id === q.logo)
      if (l) {
        pfad = await profil.absolut(l.datei)
        name = l.name
      }
    } else if (q.job) {
      const v = variante(q.job, Number(q.variante ?? 0))
      pfad = v?.bild && imOrdner(dir, v.bild) ? v.bild : null
      name = v?.titel ?? name
    }
    const g = (LOGO_EXPORTE as readonly string[]).includes(String(groesse)) ? (String(groesse) as LogoExport) : '1024'
    if (!pfad) return null
    const bild = await liesBild(pfad)
    let aus
    if (g === 'wasserzeichen') aus = skaliere(aufQuadrat(bild), 150, 150)
    else {
      const z = exportGroesse(bild.width, bild.height, Number(g))
      aus = skaliere(bild, z.breite, z.hoehe)
    }
    const win = o.fenster()
    const opts: Electron.SaveDialogOptions = { title: t('logo.export.speichern'), defaultPath: `${name.replace(/[\\/:*?"<>|]/g, '').trim() || 'logo'}-${g === 'wasserzeichen' ? 'wasserzeichen-150' : g}.png`, filters: [{ name: 'PNG', extensions: ['png'] }] }
    const ziel = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (ziel.canceled || !ziel.filePath) return null
    await writeFile(ziel.filePath, kodierePng(aus))
    shell.showItemInFolder(ziel.filePath)
    return ziel.filePath
  })

  return { starteLogo }
}
