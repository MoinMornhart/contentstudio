// Herkunft: MoinStudio src/main/planung/ipc.ts (MIT), verallgemeinert: Konten, KI-Schicht, Cross-Posting, Hochladen.
import { dialog, ipcMain, safeStorage, shell, type BrowserWindow } from 'electron'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative } from 'node:path'
import { IPC } from '@shared/app'
import { plusTage, tagVon } from '@shared/kalender'
import { hashtagsIn, type AndererTermin, type PlanungKarte, type PlanungKiArt, type PlanungKiErgebnis, type PlanungKiStand, type PlanungThumbStand } from '@shared/planung'
import type { JobQueue } from '../jobs/queue'
import type { KiSchicht } from '../ki/schicht'
import { t } from '../i18n'
import type { ProfilStore } from '../profil/store'
import { medienUrl } from '../schnitt/medien'
import { ladeProjekt, projektOrdner } from '../schnitt/projekt'
import type { ExportErgebnis } from '../schnitt/export'
import { crossPlan, type Hoehepunkt } from './crossposting'
import { planungKiJob, type PlanungKiPayload } from './ideen'
import { naechsteSpalte, texteAusExport, verbindePlanung } from './verbindung'
import { aendereKarte, beobachteKarten, kartenOrdner, ladeKarten, loescheKarte, neueKarte, verschiebeKarte, type Karte, type KartenAenderung, type Spalte } from './karten'
import { erneuere, ladeHoch, setzeThumbnail, verbindeImBrowser, VerbindungsSpeicher, type VerbindungInfo } from './upload'

/** Planung (ROADMAP M6): Karten für die Oberfläche; Änderungen im Ordner (auch vom anderen Gerät) werden gemeldet. */

const VIDEO_ENDUNGEN = ['mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'ts', 'm4v']

/** Pfad relativ zum Datenordner, nur wenn die Datei wirklich darin liegt */
const imDaten = (d: string, pfad: string): string | null => {
  const r = relative(d, pfad)
  return r && !r.startsWith('..') && !isAbsolute(r) ? r.replace(/\\/g, '/') : null
}

/** Dateiname ohne Zeichen, die Windows nicht mag */
const dateiName = (s: string): string =>
  [...s]
    .map((z) => (z.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(z) ? ' ' : z))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'video'

export interface PlanungVerbindung {
  queue: JobQueue
  profil: ProfilStore
  ki: KiSchicht
  fenster: () => BrowserWindow | undefined
  userData: string
  starteThumbnail: (roh: unknown) => Promise<string>
  starteImport: (video: string, kontoId: string) => Promise<string>
  /** Termine aus den verbundenen Kalendern (für den Wochenplan, aus MoinStudio v0.53.0) */
  andereTermine?: () => Promise<AndererTermin[]>
}

export function registerPlanungIpc(v: PlanungVerbindung): { aufruf: (kanal: string, ...a: unknown[]) => Promise<unknown>; daten: () => Promise<string> } {
  const { queue, profil } = v
  let beobachtet: { daten: string; stopp: () => void } | null = null
  const meldeGeaendert = (): void => v.fenster()?.webContents.send(IPC.planungGeaendert)
  const daten = async (): Promise<string> => {
    const d = await profil.datenordner()
    if (beobachtet?.daten !== d) {
      beobachtet?.stopp()
      await mkdir(kartenOrdner(d), { recursive: true })
      beobachtet = { daten: d, stopp: beobachteKarten(d, meldeGeaendert) }
    }
    return d
  }

  // Jede Funktion über IPC (Oberfläche) und über aufruf() (MCP-Apps)
  const methoden = new Map<string, (...a: unknown[]) => Promise<unknown>>()
  const biete = <A extends unknown[]>(kanal: string, fn: (...a: A) => unknown): void => {
    const f = async (...a: unknown[]): Promise<unknown> => fn(...(a as A))
    methoden.set(kanal, f)
    ipcMain.handle(kanal, (_e, ...a: unknown[]) => f(...a))
  }
  const oeffnen = async (o: Electron.OpenDialogOptions): Promise<string | null> => {
    const win = v.fenster()
    const r = win ? await dialog.showOpenDialog(win, o) : await dialog.showOpenDialog(o)
    return r.canceled ? null : (r.filePaths[0] ?? null)
  }

  // Vorschaubild über das Medien-Protokoll (liegt im Datenordner, also auf jedem Gerät sichtbar)
  const mitBild = (d: string, k: Karte): PlanungKarte => {
    const rel = k.thumbnail?.bild
    const pfad = rel ? join(d, rel) : null
    return { ...k, bildUrl: pfad && imDaten(d, pfad) ? medienUrl(pfad) : null }
  }
  verbindePlanung(queue, daten, meldeGeaendert)

  const kontoPruefen = async (id: unknown): Promise<string> => {
    const konten = (await profil.laden()).konten
    const k = konten.find((x) => x.id === id) ?? konten[0]
    if (!k) throw new Error(t('thumb.auftrag.keinKonto'))
    return k.id
  }
  const exportVon = async (d: string, k: Pick<Karte, 'schnitt'>): Promise<ExportErgebnis | null> =>
    k.schnitt ? (JSON.parse(await readFile(join(projektOrdner(d, k.schnitt), 'export.json'), 'utf8').catch(() => 'null')) as ExportErgebnis | null) : null
  const karte = async (d: string, id: unknown): Promise<Karte> => {
    const k = (await ladeKarten(d)).find((x) => x.id === String(id))
    if (!k) throw new Error(t('planung.fehler.karte'))
    return k
  }

  biete(IPC.planungKarten, async (): Promise<PlanungKarte[]> => {
    const d = await daten()
    return (await ladeKarten(d)).map((k) => mitBild(d, k))
  })
  biete(IPC.planungNeu, async (basis: { kontoId: string; titel: string; spalte?: Spalte; termin?: string | null; notizen?: string }): Promise<PlanungKarte> => {
    const titel = String(basis?.titel ?? '').trim()
    if (!titel) throw new Error(t('planung.fehler.titel'))
    const d = await daten()
    return mitBild(d, await neueKarte(d, { ...basis, kontoId: await kontoPruefen(basis?.kontoId), titel }))
  })
  biete(IPC.planungAendern, async (id: string, aenderung: KartenAenderung): Promise<PlanungKarte> => {
    const d = await daten()
    // Schon exportiertes Schnitt-Projekt verknüpft: Titel, Text und Kapitel gleich übernehmen
    const e = aenderung?.schnitt ? await exportVon(d, { schnitt: aenderung.schnitt }) : null
    const k = e && !aenderung.texte ? await karte(d, id) : null
    return mitBild(d, await aendereKarte(d, String(id), k && e ? { ...aenderung, texte: k.texte ?? texteAusExport(e, k) } : aenderung))
  })
  biete(IPC.planungVerschieben, async (id: string, ziel: { spalte: Spalte; index: number; kontoId?: string }): Promise<PlanungKarte> => {
    const d = await daten()
    return mitBild(d, await verschiebeKarte(d, String(id), ziel))
  })
  biete(IPC.planungLoeschen, async (id: string): Promise<void> => loescheKarte(await daten(), String(id)))

  // Verbindung zu Schnitt und Thumbnail (ROADMAP 6.2)
  biete(IPC.planungSchneiden, async (id: string): Promise<PlanungKarte | null> => {
    const d = await daten()
    const k = await karte(d, id)
    const video = await oeffnen({ title: t('planung.dialog.rohvideo', { titel: k.titel }), filters: [{ name: 'Video', extensions: VIDEO_ENDUNGEN }], properties: ['openFile'] })
    if (!video) return null
    const projekt = await v.starteImport(video, k.kontoId)
    return mitBild(d, await aendereKarte(d, k.id, { schnitt: projekt, spalte: naechsteSpalte(k, 'import') }))
  })
  biete(IPC.planungThumbnail, async (id: string): Promise<PlanungKarte> => {
    const d = await daten()
    const k = await karte(d, id)
    const notiz = k.notizen.trim()
    const beschreibung = (notiz ? `${k.titel}. ${notiz}` : k.titel).slice(0, 600)
    const auftrag = await v.starteThumbnail({ kontoId: k.kontoId, beschreibung })
    return mitBild(d, await aendereKarte(d, k.id, { thumbnail: { auftrag, bild: null, gewaehlt: false } }))
  })
  biete(IPC.planungThumbVarianten, async (id: string): Promise<PlanungThumbStand> => {
    const d = await daten()
    const k = await karte(d, id)
    const auftrag = k.thumbnail?.auftrag
    const job = auftrag ? queue.get(auftrag) : undefined
    const varianten = (auftrag ? (queue.result<{ varianten?: { titel: string; bild: string | null }[] }>(auftrag)?.varianten ?? []) : [])
      .map((x) => ({ titel: x.titel, pfad: x.bild ? imDaten(d, x.bild) : null }))
      .filter((x): x is { titel: string; pfad: string } => !!x.pfad)
      .map((x) => ({ ...x, url: medienUrl(join(d, x.pfad)) }))
    return { auftrag: job ? { state: job.state, progress: job.progress, step: job.step, error: job.error ?? null } : null, varianten }
  })
  biete(IPC.planungThumbWaehlen, async (id: string, pfad: string): Promise<PlanungKarte> => {
    const d = await daten()
    const k = await karte(d, id)
    const rel = imDaten(d, join(d, String(pfad)))
    if (!rel) throw new Error(t('planung.fehler.bild'))
    const projekt = k.schnitt ? await ladeProjekt(d, k.schnitt) : null
    const exportiert = !k.schnitt || !!projekt?.export
    const thumbnail = { auftrag: k.thumbnail?.auftrag ?? null, bild: rel, gewaehlt: true }
    return mitBild(d, await aendereKarte(d, k.id, { thumbnail, spalte: naechsteSpalte({ ...k, thumbnail }, 'thumbnail-gewaehlt', exportiert) }))
  })

  // Planung mit der KI (ROADMAP 6.3): Ideen, Titel, Wochenplan als Auftrag
  queue.register('planung-ki', (p: PlanungKiPayload, ctx) => planungKiJob(p, ctx, { ki: v.ki, profil: () => profil.laden() }))
  const ART_TITEL: Record<PlanungKiArt, string> = { ideen: 'planung.titel.ideen', titel: 'planung.titel.titel', woche: 'planung.titel.woche' }
  const starteKi = async (art: PlanungKiArt, o: { kontoId?: string; wunsch?: string; karte?: string; projekt?: string } = {}): Promise<string> => {
    if (!(art in ART_TITEL)) throw new Error(t('planung.fehler.aktion', { aktion: String(art) }))
    if (!(await v.ki.kandidaten()).length) throw new Error(t('planung.fehler.ohneKi'))
    // für den Wochenplan: andere Termine der nächsten zwei Wochen
    const heute = tagVon(new Date())
    const bis = plusTage(heute, 15)
    const termine = art === 'woche' && v.andereTermine ? (await v.andereTermine().catch((): AndererTermin[] => [])).filter((x) => x.ende.slice(0, 10) >= heute && x.start.slice(0, 10) <= bis).map(({ titel, start, ende, ganztag }) => ({ titel, start, ende, ganztag })) : undefined
    const payload: PlanungKiPayload = { art, daten: await daten(), kontoId: art === 'ideen' ? await kontoPruefen(o.kontoId) : undefined, wunsch: o.wunsch, karte: o.karte, projekt: typeof o.projekt === 'string' ? o.projekt : undefined, ...(termine ? { termine } : {}) }
    const konto = (await profil.laden()).konten.find((k) => k.id === payload.kontoId)
    return queue.enqueue('planung-ki', t(ART_TITEL[art] as 'planung.titel.ideen', { konto: konto?.name ?? '' }), payload)
  }
  biete(IPC.planungKi, starteKi)
  const kiStand = async (auftrag: string): Promise<PlanungKiStand | null> => {
    const job = queue.get(String(auftrag))
    if (!job) return null
    return { state: job.state, progress: job.progress, step: job.step, error: job.error ?? null, ergebnis: job.state === 'done' ? (queue.result<PlanungKiErgebnis>(job.id) ?? null) : null }
  }
  biete(IPC.planungKiStand, kiStand)

  // Cross-Posting (ROADMAP 6.4): Plan aus dem Termin der Karte und den Höhepunkten des Schnitt-Projekts
  const crossPlanFuer = async (id: string): Promise<PlanungKarte> => {
    const d = await daten()
    const k = await karte(d, id)
    const p = await profil.laden()
    const konto = p.konten.find((x) => x.id === k.kontoId)
    if (!konto) throw new Error(t('thumb.auftrag.keinKonto'))
    if (!k.termin) throw new Error(t('planung.fehler.ohneTermin'))
    const hoehepunkte = k.schnitt ? ((JSON.parse(await readFile(join(projektOrdner(d, k.schnitt), 'highlights.json'), 'utf8').catch(() => '[]')) as Hoehepunkt[]) ?? []) : []
    const plan = crossPlan({ lang: { kontoId: konto.id, plattform: konto.plattform, titel: k.texte?.titel || k.titel, termin: k.termin }, hoehepunkte, konten: p.konten })
    return mitBild(d, await aendereKarte(d, k.id, { crossposting: plan }))
  }
  biete(IPC.planungCrossPlan, crossPlanFuer)

  // Upload-Paket (ROADMAP 6.5): Video, Thumbnail und Texte in einen Ordner der Wahl – ohne Anmeldung, immer möglich
  biete(IPC.planungPaket, async (id: string): Promise<string | null> => {
    const d = await daten()
    const k = await karte(d, id)
    const ziel = await oeffnen({ title: t('planung.dialog.paket'), properties: ['openDirectory', 'createDirectory'] })
    if (!ziel) return null
    const ordner = join(ziel, dateiName(k.titel))
    await mkdir(ordner, { recursive: true })
    const e = await exportVon(d, k)
    if (e) await copyFile(e.datei, join(ordner, `${dateiName(k.texte?.titel || k.titel)}${extname(e.datei)}`))
    if (k.thumbnail?.bild) await copyFile(join(d, k.thumbnail.bild), join(ordner, `thumbnail${extname(k.thumbnail.bild)}`))
    const texte = k.texte ?? (e ? { plattform: e.plattform, titel: e.titel[0] ?? k.titel, beschreibung: e.beschreibung, kapitel: '' } : null)
    const zeilen = [
      `${t('planung.paket.titel')}: ${texte?.titel ?? k.titel}`,
      k.termin ? `${t('planung.paket.termin')}: ${k.termin.replace('T', ' ')}` : '',
      '',
      texte?.beschreibung ?? '',
      texte?.kapitel ? `\n${texte.kapitel}` : '',
      k.crossposting.length ? `\n${t('planung.paket.cross')}:\n${k.crossposting.map((c) => `- ${c.termin.replace('T', ' ')} ${t(`plattform.${c.plattform}`)}: ${c.titel}${c.von !== null ? ` (${Math.round(c.von)}–${Math.round(c.bis ?? c.von)} s)` : ''}`).join('\n')}` : ''
    ]
    await writeFile(join(ordner, 'texte.txt'), `${zeilen.filter((z, i) => z || i === 2).join('\n').trim()}\n`)
    void shell.openPath(ordner)
    return ordner
  })

  // Optionales Hochladen über die offizielle Anmeldung (YouTube, ungetestet bis ein Mensch verbindet)
  const verbindungen = new VerbindungsSpeicher(v.userData, { verfuegbar: () => safeStorage.isEncryptionAvailable(), verschluesseln: (s) => safeStorage.encryptString(s), entschluesseln: (b) => safeStorage.decryptString(b) })
  biete(IPC.uploadVerbindungen, (): Promise<VerbindungInfo[]> => verbindungen.liste())
  biete(IPC.uploadVerbinden, async (kontoId: string, klient: { clientId: string; clientSecret: string }): Promise<VerbindungInfo[]> => {
    const k = { clientId: String(klient?.clientId ?? '').trim(), clientSecret: String(klient?.clientSecret ?? '').trim() }
    if (!k.clientId || !k.clientSecret) throw new Error(t('upload.fehler.klient'))
    const { refresh } = await verbindeImBrowser(k, (url) => void shell.openExternal(url))
    await verbindungen.setze(await kontoPruefen(kontoId), { ...k, refresh })
    return verbindungen.liste()
  })
  biete(IPC.uploadTrennen, async (kontoId: string): Promise<VerbindungInfo[]> => {
    await verbindungen.trenne(String(kontoId))
    return verbindungen.liste()
  })
  queue.register('upload-youtube', async (p: { daten: string; karte: string }, ctx) => {
    const k = await karte(p.daten, p.karte)
    const g = await verbindungen.hole(k.kontoId)
    if (!g) throw new Error(t('upload.fehler.nichtVerbunden'))
    const e = await exportVon(p.daten, k)
    if (!e) throw new Error(t('upload.fehler.keinExport'))
    ctx.progress(2, t('upload.schritt.anmelden'))
    const access = await erneuere(g, g.refresh)
    const texte = k.texte ?? { titel: e.titel[0] ?? k.titel, beschreibung: e.beschreibung, kapitel: '' }
    const beschreibung = [texte.beschreibung, texte.kapitel].filter(Boolean).join('\n\n')
    const r = await ladeHoch(access, { datei: e.datei, titel: texte.titel, beschreibung, tags: hashtagsIn(beschreibung).map((h) => h.slice(1)), termin: k.termin }, fetch, (a) => ctx.progress(5 + a * 90, t('upload.schritt.hochladen', { prozent: Math.round(a * 100) })))
    if (k.thumbnail?.bild) await setzeThumbnail(access, r.videoId, join(p.daten, k.thumbnail.bild)).catch(() => undefined)
    await aendereKarte(p.daten, k.id, { notizen: `${k.notizen}\n\nYouTube: https://youtu.be/${r.videoId} (${basename(e.datei)})`.trim() })
    ctx.progress(100, t('jobs.schritt.fertig'))
    return r
  })
  biete(IPC.uploadStart, async (id: string): Promise<string> => {
    const d = await daten()
    const k = await karte(d, id)
    return queue.enqueue('upload-youtube', t('upload.titel', { titel: k.titel }), { daten: d, karte: k.id })
  })

  const aufruf = async (kanal: string, ...a: unknown[]): Promise<unknown> => {
    const f = methoden.get(kanal)
    if (!f) throw new Error(`unknown ${kanal}`)
    return f(...a)
  }
  return { aufruf, daten }
}
