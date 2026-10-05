// Herkunft: MoinStudio src/main/kalender/ipc.ts (MIT, v0.53.0), Passwort nur über den Tresor (safeStorage), ohne
// Rückfall auf unverschlüsselte Speicherung; Kontonamen aus dem Creator-Profil.
import { ipcMain, safeStorage, type BrowserWindow } from 'electron'
import { IPC } from '@shared/app'
import type { KalenderLink } from '@shared/planung'
import type { Tresor } from '../ki/schluessel'
import { beobachteKarten } from '../planung/karten'
import type { ProfilStore } from '../profil/store'
import { KalenderSync } from './sync'

/**
 * Kalender-Abgleich (aus MoinStudio v0.53.0) an die Oberfläche anbinden. `starte()` lässt ihn im Hintergrund laufen
 * (nur mit Oberfläche, nicht in Befehlen ohne Fenster und nicht im Screenshot-Modus).
 */
export function registerKalenderIpc(o: { daten: () => Promise<string>; geraet: string; profil: ProfilStore; fenster: () => BrowserWindow | undefined }): { sync: KalenderSync; starte: () => void } {
  // app-spezifisches Passwort mit dem Schlüsselspeicher des Betriebssystems (unter Windows DPAPI) verschlüsseln
  const tresor: Tresor = {
    verfuegbar: () => safeStorage.isEncryptionAvailable(),
    verschluesseln: (s) => safeStorage.encryptString(s),
    entschluesseln: (b) => safeStorage.decryptString(b)
  }
  const sync = new KalenderSync({
    daten: o.daten,
    geraet: o.geraet,
    tresor,
    kontoNamen: async () => Object.fromEntries((await o.profil.laden()).konten.map((k) => [k.id, k.name])),
    melde: () => o.fenster()?.webContents.send(IPC.kalenderGeaendert)
  })
  ipcMain.handle(IPC.kalenderStand, () => sync.stand())
  ipcMain.handle(IPC.kalenderApple, (_e, benutzer: unknown, passwort: unknown) => sync.verbindeApple(String(benutzer ?? ''), String(passwort ?? '')))
  ipcMain.handle(IPC.kalenderAppleTrennen, () => sync.trenneApple())
  ipcMain.handle(IPC.kalenderEinstellen, (_e, e: { eintragen?: boolean; ausgeblendet?: string[]; links?: KalenderLink[] } | null) => sync.einstellen(e ?? {}))
  ipcMain.handle(IPC.kalenderLinkPruefen, (_e, url: unknown) => sync.pruefeLink(String(url ?? '')))
  ipcMain.handle(IPC.kalenderJetzt, () => sync.synchronisiere())

  const starte = (): void => {
    // Kartenänderungen (auch vom anderen Gerät) kurz danach in den Kalender bringen
    let beobachtet: { daten: string; stopp: () => void } | null = null
    const beobachte = async (): Promise<void> => {
      const d = await o.daten().catch(() => null)
      if (!d || beobachtet?.daten === d) return
      beobachtet?.stopp()
      beobachtet = { daten: d, stopp: beobachteKarten(d, () => sync.anstossen(), 1_500) }
    }
    void beobachte()
    setInterval(() => void beobachte(), 60_000).unref()
    sync.start()
  }
  return { sync, starte }
}
