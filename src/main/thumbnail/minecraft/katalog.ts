// Herkunft: MoinStudio src/main/thumbnail/katalog.ts (MIT).
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Baukasten für die Thumbnail-Planung (ROADMAP 5.1): was der Blender-Szenen-Bauer kann. Wird zur Laufzeit direkt aus
 * den Blender-Skripten und der Mob-Tabelle gelesen, damit Claude nie etwas plant, das es nicht (mehr) gibt.
 */
export interface Katalog {
  posen: { name: string; hinweis: string }[]
  mimiken: string[]
  kameraModi: string[]
  himmel: string[]
  welten: { name: string; hinweis: string }[]
  mobs: string[]
  bloecke: string[]
}

/** Welt-Arten des Szenen-Bauers (blender/minecraft/szene.py `_welt`) mit kurzer Erklärung für Claude. */
export const WELTEN: Katalog['welten'] = [
  { name: 'wiese', hinweis: 'Ebene mit Gras, Blumen und Bäumen (Spawn, Plains, Wald)' },
  { name: 'klippe', hinweis: 'Plateau mit senkrechtem Abgrund nach +X, gegenüber Hügel; kante = x der Kante, tiefe in Blöcken' },
  { name: 'schlucht', hinweis: 'wie klippe' },
  { name: 'meeresklippe', hinweis: 'Klippe mit offenem Meer bis zum Horizont' },
  { name: 'dorf', hinweis: 'Ebenen-Dorf mit Häusern, Wegen, Brunnen, Feld (Dorfbewohner als Mobs dazu)' },
  { name: 'lavameer', hinweis: 'Lavasee bis zum Horizont, Figur auf einer Erdsäule bei (0, 0); weitere Säulen über „bloecke“' },
  { name: 'meer', hinweis: 'Wasser bis zum Horizont, Figur auf einer Säule' },
  { name: 'end', hinweis: 'Das End: Endstein-Insel mit Obsidiansäulen, dazu himmel end; Enderdrache als Mob ender_dragon (hoehe 6–12), Endkristalle ender_crystal' },
  { name: 'hoehle', hinweis: 'geschlossene Höhle mit Erzen und Lava- oder Wasserbecken auf der Themenseite' },
  { name: 'nether', hinweis: 'Nether als riesige Höhle mit Lavameer, Lavafällen, Glowstone und Glut; "biom": oede (Netherrack), karmesin (rote Riesenpilze), wirr (türkis, Wirrpilze), seelensand (Seelensandtal, Knochen, Basaltsäulen), basalt (Basaltdeltas); himmel wird automatisch zur Nether-Stimmung' }
]

/** Liest die Namen aus einem Python-Dict-Block: Zeilen der Form `    "name": {` bzw. `    "name": {"schlüssel"`. */
function schluessel(quelle: string, block: string, muster = /^ {4}"([a-z0-9_]+)": \{/): { name: string; hinweis: string }[] {
  const start = quelle.indexOf(`${block} = {`)
  if (start < 0) return []
  const ende = quelle.indexOf('\n}', start)
  const zeilen = quelle.slice(start, ende).split('\n')
  const ergebnis: { name: string; hinweis: string }[] = []
  let kommentar = ''
  for (const z of zeilen) {
    const k = /^ {4}# ?(.*)$/.exec(z)
    if (k) {
      kommentar = k[1]!.trim()
      continue
    }
    const m = muster.exec(z)
    if (m) {
      const inline = /\{\s*#\s*(.*)$/.exec(z)?.[1]?.trim()
      ergebnis.push({ name: m[1]!, hinweis: inline ?? kommentar })
      kommentar = ''
    }
  }
  return ergebnis
}

/** Wurfgeschosse und Effekte aus den Entity-Daten sind keine Mobs – im Spiel flache Item-Bilder, als Modell schwarze
 * Scheiben (aus MoinStudio v0.39.0). In Thumbnails kommen sie als gehaltenes Item vor (egg, snowball, splash_potion …). */
export const KEINE_MOBS = new Set(['egg', 'snowball', 'ender_pearl', 'eye_of_ender_signal', 'splash_potion', 'lingering_potion', 'llama_spit', 'shulker_bullet', 'breeze_wind_charge_projectile', 'wind_charge_projectile', 'evocation_fang', 'thrown_trident', 'fireball', 'small_fireball', 'dragon_fireball', 'wither_skull', 'wither_skull_dangerous', 'xp_bottle', 'xp_orb', 'arrow', 'fishing_hook', 'lightning_bolt', 'area_effect_cloud', 'fireworks_rocket', 'leash_knot', 'npc'])

/** `mobTabelle`: Pfad zur Mob-Tabelle (Ordner mit mobs.json oder die Datei selbst); `blockModelle`: models/block der Spieldatei */
export async function ladeKatalog(blenderDir: string, mobTabelle: string, blockModelle?: string): Promise<Katalog> {
  const lies = (f: string): Promise<string> => readFile(join(blenderDir, 'minecraft', f), 'utf8')
  const [posen, kamera, himmel, bloecke, mobs, mimik] = await Promise.all([
    lies('posen.py'),
    lies('kamera.py'),
    lies('himmel.py'),
    lies('bloecke.py'),
    readFile(mobTabelle.endsWith('.json') ? mobTabelle : join(mobTabelle, 'mobs.json'), 'utf8'),
    lies('mimik.py')
  ])
  return {
    posen: schluessel(posen, 'POSEN'),
    mimiken: [...(/AUSDRUECKE = \(([^)]*)\)/.exec(mimik)?.[1] ?? '').matchAll(/"(\w+)"/g)].map((m) => m[1]!),
    kameraModi: schluessel(kamera, 'MODI').map((e) => e.name),
    himmel: schluessel(himmel, 'VARIANTEN').map((e) => e.name),
    welten: WELTEN,
    mobs: Object.keys(JSON.parse(mobs) as Record<string, unknown>).filter((k) => !k.startsWith('_') && !KEINE_MOBS.has(k)),
    bloecke: [...new Set([...schluessel(bloecke, 'ARTEN').map((e) => e.name), ...(blockModelle ? await alleBloecke(blockModelle) : [])])]
  }
}

/**
 * Alle Block-IDs der Spieldatei. Maßgeblich sind die Blockstates (jede echte ID, auch gewachstes Kupfer oder
 * pink_petals ohne gleichnamiges Modell); ohne Blockstates die Modelle ohne Teilmodelle wie Treppenstufen-Varianten.
 */
async function alleBloecke(ordner: string): Promise<string[]> {
  const zustaende = await readdir(join(ordner, '..', '..', 'blockstates')).catch(() => [] as string[])
  if (zustaende.length) return zustaende.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((n) => !/^((cave_|void_)?air|barrier|light|structure_void)$/.test(n))
  const dateien = await readdir(ordner).catch(() => [] as string[])
  return dateien
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .filter((n) => !/_(inner|outer|top|bottom|side|post|noside|inventory|on|off|open|lit|stage\d+|\d+)$/.test(n))
}
