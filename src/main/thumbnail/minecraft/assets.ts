// Herkunft: MoinStudio src/main/thumbnail/minecraft.ts (MIT), erweitert um die Spielinstallation des Nutzers.
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { t } from '../../i18n'

/**
 * Echte Minecraft-Texturen, Schrift und Blockmodelle für die 3D-Szene (ROADMAP 4.3). Sie kommen nie aus dem Repo,
 * sondern immer zur Laufzeit aus der Spieldatei des Nutzers:
 * 1. aus seiner Java-Installation (offizieller Launcher, `%APPDATA%\.minecraft\versions`, oder ein eigener Ordner),
 * 2. sonst – nur wenn die Person bestätigt hat, dass sie Minecraft besitzt – dieselbe offizielle Spieldatei, die auch
 *    der Launcher von Mojangs Servern lädt (per SHA1 geprüft),
 * 3. ohne Internet die zuletzt entpackte Version.
 * Entpackt werden nur Texturen, Schrift, Blockmodelle und Blockzustände in einen lokalen Zwischenspeicher (nicht in den
 * Datenordner, damit nichts davon über Cloud-Dienste geteilt wird).
 */

const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const TEILE = ['assets/minecraft/textures', 'assets/minecraft/font', 'assets/minecraft/models', 'assets/minecraft/blockstates']

export interface McAssets {
  version: string
  /** Woher die Dateien stammen */
  quelle: 'installation' | 'mojang' | 'zwischenspeicher'
  /** …/assets/minecraft (enthält textures/, font/, models/, blockstates/) */
  assets: string
  textures: string
}

export class McFehlt extends Error {}

interface Manifest {
  latest: { release: string; snapshot: string }
  versions: { id: string; url: string; sha1: string }[]
}

async function sha1(pfad: string): Promise<string> {
  const h = createHash('sha1')
  for await (const teil of createReadStream(pfad)) h.update(teil as Buffer)
  return h.digest('hex')
}

async function json<T>(url: string, fetcher: typeof fetch): Promise<T> {
  const res = await fetcher(url)
  if (!res.ok) throw new Error(`${res.status}: ${url}`)
  return (await res.json()) as T
}

/** Entpackt Teile eines ZIP/JAR mit dem in Windows 10/11 enthaltenen tar (bsdtar kann ZIP). */
export function entpacke(archiv: string, ziel: string, pfade: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tar = process.platform === 'win32' ? join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
    const child = spawn(tar, ['-xf', archiv, '-C', ziel, ...pfade], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    child.stderr.on('data', (d: Buffer) => (err += d.toString()))
    child.once('error', reject)
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`tar ${code}: ${err.trim()}`))))
  })
}

export function mcPfade(cache: string, version: string, quelle: McAssets['quelle']): McAssets {
  const assets = join(cache, version, 'extracted', 'assets', 'minecraft')
  return { version, quelle, assets, textures: join(assets, 'textures') }
}

const vollstaendig = (p: McAssets): boolean => existsSync(join(p.textures, 'block', 'stone.png')) && existsSync(join(p.assets, 'models', 'block', 'stone.json'))

/** Standardordner der Java-Installationen (offizieller Launcher). Weitere Ordner kann die Person selbst angeben. */
export function installationsOrdner(appdata = process.env['APPDATA'] ?? ''): string[] {
  return appdata ? [join(appdata, '.minecraft', 'versions')] : []
}

/**
 * Sucht die zuletzt gespielte Java-Version: Ordner `versions/<v>/<v>.jar` (Mod-Loader-Profile ohne eigene Spieldatei
 * werden übersprungen). Maßgeblich ist das Änderungsdatum der Spieldatei.
 */
export async function findeInstallation(ordner: string[]): Promise<{ version: string; jar: string } | null> {
  let beste: { version: string; jar: string; zeit: number } | null = null
  for (const o of ordner) {
    for (const v of await readdir(o).catch(() => [] as string[])) {
      const jar = join(o, v, `${v}.jar`)
      const s = await stat(jar).catch(() => null)
      // Echte Spieldateien sind groß (> 10 MB); Mod-Profile haben nur winzige oder gar keine JARs
      if (!s || s.size < 10_000_000) continue
      if (!beste || s.mtimeMs > beste.zeit) beste = { version: v, jar, zeit: s.mtimeMs }
    }
  }
  return beste ? { version: beste.version, jar: beste.jar } : null
}

async function zuletzt(cache: string): Promise<McAssets | null> {
  const alt = JSON.parse(await readFile(join(cache, 'aktuell.json'), 'utf8').catch(() => '{}')) as { version?: string; quelle?: McAssets['quelle'] }
  if (alt.version) {
    const p = mcPfade(cache, alt.version, 'zwischenspeicher')
    if (vollstaendig(p)) return p
  }
  // Ältere Zwischenspeicher (z. B. aus MoinStudio übernommen): neueste vollständige Version
  const versionen = (await readdir(cache).catch(() => [] as string[])).filter((v) => vollstaendig(mcPfade(cache, v, 'zwischenspeicher')))
  versionen.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
  return versionen[0] ? mcPfade(cache, versionen[0], 'zwischenspeicher') : null
}

async function merke(cache: string, p: McAssets): Promise<McAssets> {
  await writeFile(join(cache, 'aktuell.json'), JSON.stringify({ version: p.version, quelle: p.quelle }))
  return p
}

export interface McOptionen {
  /** Die Person hat bestätigt, Minecraft zu besitzen: Spieldatei darf wie im Launcher von Mojang geladen werden */
  mojangErlaubt: boolean
  /** Zusätzliche Ordner mit Java-Versionen (andere Launcher) */
  ordner?: string[]
  appdata?: string
  fetcher?: typeof fetch
  onProgress?: (text: string) => void
}

/** Liefert entpackte Texturen und Modelle; `cache` ist ein lokaler Ordner (z. B. %LOCALAPPDATA%\ContentStudio\mc). */
export async function sichereMcAssets(cache: string, o: McOptionen): Promise<McAssets> {
  await mkdir(cache, { recursive: true })
  const inst = await findeInstallation([...installationsOrdner(o.appdata), ...(o.ordner ?? [])])
  if (inst) {
    const p = mcPfade(cache, inst.version, 'installation')
    if (!vollstaendig(p)) {
      o.onProgress?.(t('thumb.mc.entpacke', { version: inst.version }))
      await mkdir(join(cache, inst.version, 'extracted'), { recursive: true })
      await entpacke(inst.jar, join(cache, inst.version, 'extracted'), TEILE)
    }
    return merke(cache, p)
  }
  if (o.mojangErlaubt) {
    try {
      return await merke(cache, await vonMojang(cache, o))
    } catch (err) {
      const alt = await zuletzt(cache)
      if (alt) return alt
      throw err instanceof Error ? err : new Error(String(err))
    }
  }
  const alt = await zuletzt(cache)
  if (alt) return alt
  throw new McFehlt(t('thumb.mc.fehlt'))
}

async function vonMojang(cache: string, o: McOptionen): Promise<McAssets> {
  const fetcher = o.fetcher ?? fetch
  const manifest = await json<Manifest>(MANIFEST, fetcher)
  // Die aktuelle Vollversion (keine Snapshots): so wie sie die meisten spielen
  const version = manifest.latest.release
  const p = mcPfade(cache, version, 'mojang')
  if (vollstaendig(p)) return p
  const eintrag = manifest.versions.find((v) => v.id === version)
  if (!eintrag) throw new Error(`Version ${version} fehlt im Manifest`)
  const info = await json<{ downloads: { client: { url: string; sha1: string } } }>(eintrag.url, fetcher)
  const ordner = join(cache, version)
  await mkdir(join(ordner, 'extracted'), { recursive: true })
  const jar = join(ordner, 'client.jar')
  if (!existsSync(jar) || (await sha1(jar)) !== info.downloads.client.sha1) {
    o.onProgress?.(t('thumb.mc.lade', { version }))
    const res = await fetcher(info.downloads.client.url)
    if (!res.ok) throw new Error(`${res.status}: ${info.downloads.client.url}`)
    await writeFile(`${jar}.teil`, Buffer.from(await res.arrayBuffer()))
    if ((await sha1(`${jar}.teil`)) !== info.downloads.client.sha1) {
      await rm(`${jar}.teil`, { force: true })
      throw new Error(t('thumb.mc.beschaedigt'))
    }
    await rename(`${jar}.teil`, jar)
  }
  o.onProgress?.(t('thumb.mc.entpacke', { version }))
  await entpacke(jar, join(ordner, 'extracted'), TEILE)
  return p
}
