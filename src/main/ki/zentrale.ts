import { dialog, ipcMain, safeStorage, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import { z } from 'zod'
import { IPC } from '@shared/app'
import { gebietsschema } from '@shared/i18n'
import { KI_WEGE, type KiWegStand } from '@shared/ki'
import type { Profil } from '@shared/profil'
import type { ProfilStore } from '../profil/store'
import { hauptSprache, t } from '../i18n'
import { AnthropicApi } from './anbieter/anthropic-api'
import { CodexCli } from './anbieter/codex-cli'
import { GoogleApi } from './anbieter/google-api'
import { Ollama } from './anbieter/ollama'
import { OpenAiKompatibel, waehleOpenAi } from './anbieter/openai-kompatibel'
import { KostenBuch, PreisListe } from './kosten'
import { KiSchicht, mitZustimmung } from './schicht'
import { SchluesselSpeicher } from './schluessel'
import type { KiAnbieter } from './typen'

/** Test-Auftrag für den Knopf „Testen“: winzig, damit er fast nichts kostet */
const TEST = z.object({ ok: z.boolean() })

/**
 * Legt alle KI-Wege an (docs/ki-anbieter.md: nur erlaubte), liest Reihenfolge, Aktivierung und Modell aus dem
 * Creator-Profil und stellt die KI-Schicht für alle Funktionen bereit.
 */
export function kiZentrale(o: { profil: ProfilStore; userData: string; localRoot: string; fenster: () => BrowserWindow | undefined }): { schicht: KiSchicht; anbieter: Map<string, KiAnbieter> } {
  const schluessel = new SchluesselSpeicher(o.userData, {
    verfuegbar: () => safeStorage.isEncryptionAvailable(),
    verschluesseln: (s) => safeStorage.encryptString(s),
    entschluesseln: (b) => safeStorage.decryptString(b)
  })
  const preise = new PreisListe(o.localRoot)
  const buch = new KostenBuch(o.userData)
  const profil = (): Promise<Profil | null> => o.profil.laden().catch(() => null)
  const modell = (id: string) => async (): Promise<string | null> => (await profil())?.ki.wege.find((w) => w.id === id)?.modell ?? null
  const key = (id: string) => (): Promise<string | null> => schluessel.hole(id)

  const liste: KiAnbieter[] = [
    new Ollama(modell('ollama')),
    new OpenAiKompatibel({
      id: 'lmstudio',
      art: 'lokal',
      name: 'LM Studio',
      basis: 'http://127.0.0.1:1234/v1',
      schluessel: async () => null,
      modell: modell('lmstudio'),
      bilder: async (m) => {
        const r = await fetch('http://127.0.0.1:1234/api/v0/models', { signal: AbortSignal.timeout(3000) })
        const d = (await r.json()) as { data?: { id: string; type?: string }[] }
        return d.data?.find((x) => x.id === m)?.type === 'vlm'
      }
    }),
    new OpenAiKompatibel({
      id: 'llamacpp',
      art: 'lokal',
      name: 'llama.cpp',
      basis: 'http://127.0.0.1:8080/v1',
      schluessel: async () => null,
      modell: modell('llamacpp'),
      bilder: async () => {
        const r = await fetch('http://127.0.0.1:8080/props', { signal: AbortSignal.timeout(3000) })
        return ((await r.json()) as { modalities?: { vision?: boolean } }).modalities?.vision === true
      }
    }),
    new CodexCli(join(o.localRoot, 'ki-arbeit', 'codex'), modell('codex-cli')),
    new AnthropicApi(schluessel, modell('api-anthropic')),
    new OpenAiKompatibel({
      id: 'api-openai',
      art: 'api',
      name: 'OpenAI',
      basis: 'https://api.openai.com/v1',
      schluessel: key('api-openai'),
      modell: modell('api-openai'),
      waehle: waehleOpenAi,
      maxCompletionTokens: true,
      preisFuer: (m) => preise.preis(`openai/${m}`)
    }),
    new GoogleApi(key('api-google'), modell('api-google'), (m) => preise.preis(m)),
    new OpenAiKompatibel({
      id: 'api-openrouter',
      art: 'api',
      name: 'OpenRouter',
      basis: 'https://openrouter.ai/api/v1',
      schluessel: key('api-openrouter'),
      modell: modell('api-openrouter'),
      standard: 'openrouter/auto',
      waehle: () => null,
      preisFuer: (m) => preise.preis(m),
      kopf: { 'HTTP-Referer': 'https://github.com/MoinMornhart/contentstudio', 'X-Title': 'ContentStudio' }
    })
  ]
  const anbieter = new Map(liste.map((a) => [a.id, a]))

  /** Vor dem ersten Senden an einen Anbieter: zeigen, was wohin geht, und Zustimmung merken (ROADMAP 3.8) */
  const zustimmung = async (id: string): Promise<boolean> => {
    const p = await profil()
    if (!p || p.ki.zugestimmt.includes(id)) return true
    const weg = KI_WEGE.find((w) => w.id === id)
    const win = o.fenster()
    const optionen: Electron.MessageBoxOptions = {
      type: 'question',
      buttons: [t('ki.zustimmen'), t('ki.ablehnen')],
      defaultId: 0,
      cancelId: 1,
      title: t('ki.datenschutzTitel'),
      message: t('ki.datenschutzFrage', { name: weg?.name ?? id }),
      detail: t(weg?.art === 'lokal' ? 'ki.datenschutzLokal' : 'ki.datenschutzExtern', { ziel: weg?.ziel ?? id })
    }
    const r = win ? await dialog.showMessageBox(win, optionen) : await dialog.showMessageBox(optionen)
    if (r.response !== 0) return false
    await o.profil.aendern((x) => ({ ...x, ki: { ...x.ki, zugestimmt: [...new Set([...x.ki.zugestimmt, id])] } }))
    return true
  }

  const reihenfolge = async (): Promise<{ id: string; aktiv: boolean }[]> => {
    const p = await profil()
    if (!p || p.ki.keineKi) return []
    return p.ki.wege
  }

  const umhuellt = new Map(liste.map((a) => [a.id, mitZustimmung(a, zustimmung)]))

  const kostenFrage = async ({ anbieter: id, usd }: { anbieter: string; usd: number | null }): Promise<boolean> => {
      const win = o.fenster()
      const monat = await buch.summe()
      const betrag = (x: number): string => x.toLocaleString(gebietsschema(hauptSprache()), { style: 'currency', currency: 'USD', maximumFractionDigits: 4 })
      const optionen: Electron.MessageBoxOptions = {
        type: 'question',
        buttons: [t('ki.kostenJa'), t('ki.kostenNein')],
        defaultId: 0,
        cancelId: 1,
        title: t('ki.kostenTitel'),
        message: usd === null ? t('ki.kostenUnbekannt', { name: KI_WEGE.find((w) => w.id === id)?.name ?? id }) : t('ki.kostenFrage', { betrag: betrag(usd), name: KI_WEGE.find((w) => w.id === id)?.name ?? id }),
        detail: t('ki.kostenMonat', { betrag: betrag(monat) })
      }
      return (win ? await dialog.showMessageBox(win, optionen) : await dialog.showMessageBox(optionen)).response === 0
  }
  const buchen = async (usd: number): Promise<void> => void (await buch.buche(usd))
  const schicht = new KiSchicht(umhuellt, reihenfolge, kostenFrage, buchen)

  const stand = async (a: KiAnbieter): Promise<KiWegStand> => {
    const s = await a.pruefe().catch((e: unknown) => ({ installiert: false, bereit: false, hinweis: e instanceof Error ? e.message : String(e), modelle: [] as string[] }))
    return { id: a.id, installiert: s.installiert, bereit: s.bereit, hinweis: s.hinweis, modelle: s.modelle ?? [], bilderSehen: a.faehigkeiten.bilderSehen, hatSchluessel: await schluessel.hat(a.id) }
  }

  ipcMain.handle(IPC.kiWege, async () => Promise.all(liste.map(stand)))
  ipcMain.handle(IPC.kiSchluessel, async (_e, id: unknown, wert: unknown) => {
    if (!KI_WEGE.some((w) => w.id === id && w.schluessel)) throw new Error(`unknown ${String(id)}`)
    await schluessel.setze(String(id), typeof wert === 'string' ? wert : null)
    return stand(anbieter.get(String(id))!)
  })
  ipcMain.handle(IPC.kiMonat, () => buch.summe())
  ipcMain.handle(IPC.kiTest, async (_e, id: unknown) => {
    const a = anbieter.get(String(id))
    if (!a) throw new Error(`unknown ${String(id)}`)
    // Einzeltest genau dieses Weges, mit Zustimmung und Kostenfrage wie im echten Einsatz
    const nur = new KiSchicht(new Map([[a.id, umhuellt.get(a.id)!]]), async () => [{ id: a.id, aktiv: true }], kostenFrage, buchen)
    const e = await nur.frage({ name: 'test', system: 'You are a connection test.', prompt: 'Reply with {"ok": true}.', schema: TEST, stufe: 'schnell', maxAusgabe: 50 })
    return { modell: e.modell, kostenUsd: e.kostenUsd }
  })

  return { schicht, anbieter }
}
