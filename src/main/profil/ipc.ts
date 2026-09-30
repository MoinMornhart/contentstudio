import { dialog, ipcMain, type BrowserWindow } from 'electron'
import { IPC, type ProfilDateiZweck, type ProfilStand, type ToolId } from '@shared/app'
import { brauchtDreiD, leeresProfil, type Konto, type Profil } from '@shared/profil'
import { findeProgramme } from '../programme/erkennung'
import { metadatenOhneSchluessel } from './metadaten'
import { skinAusName } from './skinname'
import type { ProfilStore } from './store'
import { t } from '../i18n'

const BILD = ['png', 'jpg', 'jpeg', 'webp']

/** Dateityp, Mehrfachauswahl und Unterordner je Zweck */
const ZWECK: Record<ProfilDateiZweck, { endungen: string[]; mehrere: boolean; ordner: string }> = {
  foto: { endungen: BILD, mehrere: true, ordner: 'fotos' },
  skin: { endungen: ['png'], mehrere: false, ordner: 'skins' },
  bilder: { endungen: BILD, mehrere: true, ordner: 'bilder' },
  modell: { endungen: ['glb', 'gltf', 'vrm', 'fbx'], mehrere: false, ordner: 'modelle' },
  maskottchen: { endungen: [...BILD, 'svg'], mehrere: false, ordner: 'maskottchen' },
  logo: { endungen: [...BILD, 'svg'], mehrere: true, ordner: 'logos' },
  schrift: { endungen: ['ttf', 'otf'], mehrere: false, ordner: 'schriften' },
  vorbild: { endungen: BILD, mehrere: true, ordner: '' }
}

/** Zielordner im Datenordner: Freunde unter freunde/<id>/, Vorbilder unter vorbilder/<konto>/, Marke unter marke/ */
export function zielOrdner(zweck: ProfilDateiZweck, besitzer?: string): string {
  const sicher = (besitzer ?? '').replace(/[^\w-]/g, '')
  if (zweck === 'vorbild') return `vorbilder/${sicher || 'allgemein'}`
  if (zweck === 'logo' || zweck === 'schrift') return `marke/${ZWECK[zweck].ordner}`
  if (sicher.startsWith('freund-')) return `freunde/${sicher}/${ZWECK[zweck].ordner}`
  return `avatare/${ZWECK[zweck].ordner}`
}

/** Welche Werkzeuge braucht dieses Profil? FFmpeg und uv immer, Blender nur für 3D. */
export function noetigeWerkzeuge(p: Profil): ToolId[] {
  return brauchtDreiD(p) ? ['ffmpeg', 'uv', 'blender'] : ['ffmpeg', 'uv']
}

export function registerProfilIpc(store: ProfilStore, getWindow: () => BrowserWindow | undefined): void {
  store.on('change', (p: Profil) => getWindow()?.webContents.send(IPC.profilGeaendert, p))

  ipcMain.handle(IPC.profilLaden, async (): Promise<ProfilStand> => {
    try {
      return { profil: await store.laden(), fehler: null }
    } catch (err) {
      return { profil: leeresProfil(), fehler: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.profilSpeichern, (_e, profil: unknown) => store.speichern(profil))

  ipcMain.handle(IPC.profilDateien, async (_e, zweck: unknown, besitzer: unknown): Promise<string[]> => {
    const z = ZWECK[zweck as ProfilDateiZweck]
    if (!z) throw new Error(`unknown purpose ${String(zweck)}`)
    const win = getWindow()
    const optionen: Electron.OpenDialogOptions = {
      title: t('profil.dateiDialog'),
      properties: z.mehrere ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: [{ name: z.endungen.map((e) => e.toUpperCase()).join(', '), extensions: z.endungen }]
    }
    const res = win ? await dialog.showOpenDialog(win, optionen) : await dialog.showOpenDialog(optionen)
    if (res.canceled) return []
    const ziel = zielOrdner(zweck as ProfilDateiZweck, typeof besitzer === 'string' ? besitzer : undefined)
    const pfade: string[] = []
    for (const quelle of res.filePaths) pfade.push(await store.dateiAblegen(quelle, ziel))
    return pfade
  })

  ipcMain.handle(IPC.profilSkinName, async (_e, name: unknown) => {
    const skin = await skinAusName(String(name ?? ''))
    const datei = await store.bytesAblegen(skin.png, 'avatare/skins', `${skin.name}.png`)
    return { datei, slim: skin.slim, name: skin.name }
  })

  ipcMain.handle(IPC.profilBild, (_e, datei: unknown) => store.bildUrl(String(datei ?? '')))

  ipcMain.handle(IPC.profilMetadaten, async (_e, kontoId: unknown): Promise<Konto> => {
    const profil = await store.laden()
    const konto = profil.konten.find((k) => k.id === kontoId)
    if (!konto?.link || !konto.metadaten?.zustimmung) throw new Error(t('meta.zustimmung'))
    const videos = await metadatenOhneSchluessel(konto.link)
    const neu = await store.aendern((p) => ({
      ...p,
      konten: p.konten.map((k) => (k.id === konto.id ? { ...k, metadaten: { zustimmung: true, abgerufen: new Date().toISOString(), videos } } : k))
    }))
    return neu.konten.find((k) => k.id === konto.id)!
  })

  ipcMain.handle(IPC.programmeFinden, () => findeProgramme())
  ipcMain.handle(IPC.werkzeugeNoetig, async () => noetigeWerkzeuge(await store.laden().catch(() => leeresProfil())))
}
