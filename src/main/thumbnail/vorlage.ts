// Herkunft: MoinStudio src/main/thumbnail/spielvorlage.ts (MIT), verallgemeinert auf Fotos und ohne Pflicht zur Bild-KI.
import { appendFile, copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { z } from 'zod'
import { runBlender } from '../jobs/blender'
import type { JobContext } from '../jobs/queue'
import type { KiSchicht } from '../ki/schicht'
import { t } from '../i18n'
import { sprachName, type ThumbDienste } from './job'
import { sichereMcAssets } from './minecraft/assets'
import { kiPruefung, technischePruefung } from './pruefung'
import { renderFoto, setzeTextUndLogo, type Bericht } from './render'
import type { ThumbErgebnisDaten, ThumbPayload, VarianteErgebnis } from './typen'
import { liesJson, py, sicherePython } from './umgebung'

/**
 * Vorlagen-Modus (ROADMAP 4.5): die Person oder den Avatar in ein vorhandenes Thumbnail setzen, genau an die Stelle der
 * Person darin. Ablauf: Vorlage auf 16:9 bringen → Person entfernen und Lücke auffüllen (rembg + LaMa, lokal) →
 * Bild-KI (falls vorhanden) liest Pose, Blick, Licht, Gegenstand und Titel → Minecraft-Skin in Blender bzw. Foto
 * freigestellt an die Stelle → Titel der Vorlage wieder obendrauf. Vorlagen und Ergebnisse bleiben im Datenordner.
 */

type Box = [number, number, number, number]
const BoxZ = z.array(z.number()).length(4)
const PunktZ = z.array(z.number()).length(2)

/** Hände [[u, v], …]: locker im Schema, gueltigeHaende() filtert (höchstens zwei, im Bild) */
const HaendeZ = z.array(z.array(z.number())).optional()
const PUNKTE = ['huefte', 'hand_r', 'hand_l', 'hals', 'fuss_r', 'fuss_l'] as const

const PersonZ = z.object({
  /** Kasten um die ganze Person samt Armen, Beinen und Gehaltenem */
  box: BoxZ.optional(),
  kopf: PunktZ,
  kopf_anteil: z.number(),
  pose: z.string().optional(),
  winkel: z.record(z.string(), z.unknown()).optional(),
  ansicht: z.enum(['vorn', 'hinten']).optional(),
  blick: z.number().optional(),
  /** Wo die Hände der Person im Bild sind – die Arme der Figur werden genau dorthin gerichtet */
  haende: HaendeZ
})

/** Verbindung zwischen zwei Personen der Vorlage (Kette, Seil, Leine); „ich“ = Hauptfigur, „freund0“ … = weitere[0] … */
const VerbindungZ = z.object({
  von: z.string(),
  zu: z.string(),
  art: z.enum(['kette', 'seil', 'leine']),
  von_punkt: z.enum(PUNKTE).optional(),
  zu_punkt: z.enum(PUNKTE).optional(),
  /** Kasten um die Verbindung im Bild (wird entfernt und neu gezeichnet) */
  box: BoxZ.optional()
})
export type Verbindung = z.infer<typeof VerbindungZ>

export const VorlagenAnalyseZ = z.object({
  inhalt: z.string(),
  /** Kasten um die Person, die die Hauptfigur ersetzt */
  box: BoxZ.optional(),
  kopf: PunktZ,
  kopf_anteil: z.number(),
  pose: z.string().optional(),
  winkel: z.record(z.string(), z.unknown()).optional(),
  mimik: z.string().optional(),
  licht_seite: z.enum(['links', 'rechts']).optional(),
  ansicht: z.enum(['vorn', 'hinten']).optional(),
  ziel: PunktZ.optional(),
  blick: z.number().optional(),
  haende: HaendeZ,
  gegenstand: z.object({ box: BoxZ, suchwort: z.string(), hand: z.enum(['r', 'l']).optional() }).optional(),
  titel: z.array(z.object({ box: BoxZ, farbe: z.string().regex(/^#[0-9a-fA-F]{6}$/) })).optional(),
  weitere: z.array(PersonZ).optional(),
  verbindungen: z.array(VerbindungZ).optional()
})
export type VorlagenAnalyse = z.infer<typeof VorlagenAnalyseZ>

export const MIMIKEN = ['neutral', 'wuetend', 'traurig', 'erschrocken', 'muede', 'skeptisch', 'froh', 'schreiend']

const existiert = (p: string): Promise<boolean> => stat(p).then(
  () => true,
  () => false
)

/** Namen aller fertigen Posen aus blender/minecraft/posen.py */
export async function posenNamen(skripte: string): Promise<string[]> {
  const text = await readFile(join(skripte, 'minecraft', 'posen.py'), 'utf8').catch(() => '')
  return [...text.matchAll(/^ {4}"(\w+)": \{/gm)].map((m) => m[1]!)
}

/** Winkel einiger fertiger Posen als Beispiele für die KI (Text direkt aus posen.py) */
export async function posenBeispiele(skripte: string, namen: string[]): Promise<string> {
  const text = await readFile(join(skripte, 'minecraft', 'posen.py'), 'utf8').catch(() => '')
  return namen
    .map((n) => new RegExp(String.raw`^ {4}"${n}": (\{[\s\S]*?\n {4}\}),`, 'm').exec(text)?.[1])
    .map((b, i) => (b ? `${namen[i]}: ${b.replace(/\s+/g, ' ')}` : ''))
    .filter(Boolean)
    .join('\n')
}

/** Das beste CC0-Modell von Poly Haven zu einem Suchwort (Name, Tags, Kategorien), sonst null */
export function besterTreffer(assets: Record<string, { name?: string; tags?: string[]; categories?: string[] }>, suchwort: string): string | null {
  const worte = suchwort.toLowerCase().split(/[\s,_-]+/).filter((w) => w.length > 2)
  let bester: [string, number] | null = null
  for (const [id, a] of Object.entries(assets)) {
    const felder = [id, a.name ?? '', ...(a.tags ?? []), ...(a.categories ?? [])].map((x) => x.toLowerCase())
    const punkte = worte.reduce((n, w) => n + (id.includes(w) ? 3 : 0) + felder.filter((f) => f.includes(w)).length, 0)
    if (punkte > 0 && (!bester || punkte > bester[1])) bester = [id, punkte]
  }
  return bester?.[0] ?? null
}

/**
 * Verwandte Suchwörter, wenn es das genaue Modell bei Poly Haven nicht gibt (z. B. keine Schrotflinte): lieber ein
 * ähnliches Ding in der Hand als leere Hände in einer Halte-Pose (aus MoinStudio v0.40.0).
 */
const ERSATZ: [RegExp, string][] = [
  [/shotgun|rifle|musket|sniper|flinte|gewehr|machine ?gun|smg|assault/i, 'rifle'],
  [/revolver|handgun|colt|gun|pistole|blaster/i, 'pistol'],
  [/battle ?axe|streitaxt|axe|axt/i, 'axe'],
  [/katana|blade|saber|sabre|schwert|sword|longsword/i, 'sword'],
  [/dagger|knife|messer|dolch/i, 'dagger'],
  [/hammer|mallet|sledge/i, 'hammer'],
  [/flashlight|torch|taschenlampe|lamp/i, 'flashlight'],
  [/lantern|laterne/i, 'lantern'],
  [/shield|schild/i, 'shield'],
  [/mace|club|keule/i, 'mace']
]

export function ersatzSuchwort(suchwort: string): string | null {
  return ERSATZ.find(([muster]) => muster.test(suchwort))?.[1] ?? null
}

/** Länge des gehaltenen Dings in Minecraft-Pixeln (Arm = 12): Pistole kurz, Gewehr und Schwert lang */
export function requisitLaenge(suchwort: string): number {
  const w = suchwort.toLowerCase()
  if (/shotgun|rifle|musket|sniper|gewehr|flinte|spear|speer|staff|stab|bat|schläger/.test(w)) return 24
  if (/sword|katana|saber|sabre|schwert|axe|axt|hammer|mace|guitar|gitarre|shovel|schaufel/.test(w)) return 18
  if (/dagger|knife|messer|dolch|wand|zauberstab|torch|flashlight|lamp/.test(w)) return 11
  return 10
}

/** Waffen, mit denen man zielt: der Arm wird dann wie beim Zielen gehalten */
export function zumZielen(suchwort: string): boolean {
  return /gun|rifle|pistol|revolver|shotgun|musket|sniper|blaster|crossbow|bow|gewehr|pistole|flinte|armbrust/i.test(suchwort)
}

/** Handpositionen [[u, v], …] aus Analyse oder Prüfung: höchstens zwei, im Bild (0–1). */
export function gueltigeHaende(roh: unknown): [number, number][] {
  if (!Array.isArray(roh)) return []
  return roh.filter((h): h is [number, number] => Array.isArray(h) && h.length === 2 && h.every((z) => typeof z === 'number' && z >= 0 && z <= 1)).slice(0, 2)
}

/** Lage einer Person nach dem Freistellen (person.json, je Person eine Maske) */
export interface FreigestelltePerson {
  box?: Box
  kopf?: [number, number]
  kopf_hoehe?: number
  hoehe?: number
  unten_angeschnitten?: boolean
  maske?: string
}

/** Kästen der Personen, die ersetzt werden (Hauptfigur zuerst, dann so viele weitere, wie Freunde mitkommen) → freistellen.py */
export function personenArgumente(a: Pick<VorlagenAnalyse, 'box' | 'weitere'>, ersetzt: number): string[] {
  if (!a.box || a.box.length !== 4) return []
  const begrenzt = (b: number[]): string => b.map((z) => Math.min(1, Math.max(0, z))).join(',')
  const boxen = [a.box, ...(a.weitere ?? []).slice(0, ersetzt).map((w) => w.box)]
  if (boxen.some((b) => !b || b.length !== 4)) return [`--person=${begrenzt(a.box)}`]
  return boxen.map((b) => `--person=${begrenzt(b!)}`)
}

/** Nur Verbindungen, deren beide Enden ersetzt werden – sonst bleibt die Verbindung der Vorlage im Bild. */
export function gueltigeVerbindungen(a: Pick<VorlagenAnalyse, 'verbindungen'>, ersetzt: number): Verbindung[] {
  const da = new Set(['ich', ...Array.from({ length: ersetzt }, (_, i) => `freund${i}`)])
  return (a.verbindungen ?? []).filter((v) => da.has(v.von) && da.has(v.zu) && v.von !== v.zu)
}

/** Urteil der Schlussprüfung: passt es, was stimmt nicht, und die Korrektur als Teil der Szene */
export const PruefungZ = z.object({
  passt: z.boolean(),
  probleme: z.array(z.string()).optional(),
  korrektur: z.record(z.string(), z.unknown()).optional()
})
export type SchlussPruefung = z.infer<typeof PruefungZ>

/** Felder, die die Schlussprüfung ändern darf (Pfade, Skins und Masken nie) – Foto-Figuren haben keine Pose */
const KORRIGIERBAR = {
  minecraft: { ich: ['kopf', 'kopf_anteil', 'pose', 'mimik', 'blick', 'ansicht', 'ziel', 'licht_seite', 'kopf_drehung', 'verbindungen', 'haende'], freund: ['kopf', 'kopf_anteil', 'pose', 'blick', 'ansicht', 'haende'] },
  foto: { ich: ['kopf', 'kopf_anteil'], freund: ['kopf', 'kopf_anteil'] }
}

/** Kästen um Reste der alten Person aus der Schlussprüfung: nur gültige, nicht riesige Kästen (höchstens vier). */
export function gueltigeReste(k: Record<string, unknown>): Box[] {
  const roh = Array.isArray(k['reste']) ? (k['reste'] as unknown[]) : []
  return roh
    .filter((b): b is Box => Array.isArray(b) && b.length === 4 && b.every((z) => typeof z === 'number' && z >= 0 && z <= 1))
    .filter(([x0, y0, x1, y1]) => x1 > x0 && y1 > y0 && (x1 - x0) * (y1 - y0) <= 0.25)
    .slice(0, 4)
}

/** Korrektur der Schlussprüfung übernehmen: nur erlaubte Felder, Freunde je Index, Werte in natürlichen Grenzen. */
export function korrigiere(spec: Record<string, unknown>, k: Record<string, unknown>, art: 'minecraft' | 'foto' = 'minecraft'): void {
  const erlaubt = KORRIGIERBAR[art]
  const setze = (ziel: Record<string, unknown>, quelle: Record<string, unknown>, felder: string[]): void => {
    for (const feld of felder) {
      if (!(feld in quelle) || quelle[feld] === undefined) continue
      ziel[feld] = feld === 'pose' && quelle[feld] && typeof quelle[feld] === 'object' ? begrenzeWinkel(quelle[feld] as Record<string, unknown>) : quelle[feld]
    }
    // Größe oder Lage korrigiert: dann gilt der Wert der Prüfung, nicht mehr das Einpassen in den erkannten Umriss –
    // sonst setzt Blender die Figur wieder auf die alte Größe (Test 05.10.: dreimal „viel größer“, Figur blieb gleich)
    if (('kopf_anteil' in quelle && quelle['kopf_anteil'] !== undefined) || ('kopf' in quelle && quelle['kopf'] !== undefined)) delete ziel['person']
  }
  setze(spec, k, erlaubt.ich)
  const freunde = Array.isArray(spec['freunde']) ? (spec['freunde'] as Record<string, unknown>[]) : []
  if (Array.isArray(k['freunde'])) (k['freunde'] as unknown[]).forEach((fk, i) => fk && typeof fk === 'object' && freunde[i] && setze(freunde[i], fk as Record<string, unknown>, erlaubt.freund))
  // blick 160 sollte „vom Betrachter weg“ heißen, ergab mit ansicht hinten aber eine fast frontale Figur – Rückansicht nur über „ansicht“
  for (const x of [spec, ...freunde]) {
    if (typeof x['kopf_anteil'] === 'number') x['kopf_anteil'] = Math.min(0.7, Math.max(0.08, x['kopf_anteil']))
    if (typeof x['blick'] === 'number') x['blick'] = Math.max(-90, Math.min(90, x['blick']))
    if ('haende' in x) x['haende'] = gueltigeHaende(x['haende'])
  }
}

export function pruefPrompt(spec: Record<string, unknown>, o: { minecraft: boolean; wunsch: string | null }): string {
  const zeigen = { ...spec }
  for (const k of ['hintergrund', 'skin', 'maske', 'texturen', 'samples', 'geraet', 'requisit', 'person', 'bild']) delete zeigen[k]
  if (Array.isArray(zeigen['freunde'])) zeigen['freunde'] = (zeigen['freunde'] as Record<string, unknown>[]).map((f) => Object.fromEntries(Object.entries(f).filter(([k]) => !['skin', 'person', 'bild'].includes(k))))
  const figur = o.minecraft ? 'als Minecraft-Figur' : 'als freigestelltes Foto'
  return `Die Person des Creators wurde ${figur} in ein vorhandenes Thumbnail gesetzt, an die Stelle der Person(en) darin.
Bild 1 ist das Original, Bild 2 das Ergebnis.
${o.wunsch ? `Wunsch des Creators dazu: „${o.wunsch}“\n` : ''}
Sieh dir beide Bilder an und prüfe streng, ob das Ergebnis dem Original entspricht:
- Steht jede Figur genau dort, wo die Person stand, in derselben Größe${o.minecraft ? ' (Minecraft-Figuren sind kopflastiger – der Körper muss die Person trotzdem etwa ausfüllen)' : ''} und nicht abgeschnitten, wo die Person es nicht war?
${o.minecraft ? `- Stimmt die Haltung des GANZEN Körpers (Arme, Beine, Neigung, Sprung, Klettern, Sitzen) und die Blickrichtung?
- Sind Personen verbunden (Kette, Seil), ist die Verbindung da und hängt an den richtigen Stellen?
` : ''}- Sind Reste der alten Personen sichtbar (Geist, Hand, Kopf, Waffe, Gurt)? Dann gib "reste": [[x0, y0, x1, y1], …] an –
  großzügige Kästen (Bildkoordinaten 0–1) um jeden Rest, sie werden aus der Vorlage entfernt und neu aufgefüllt.
- Verdeckt eine Figur ein Spiel-Logo, einen Titel oder Schriftzug, der im Original VOR den Personen lag? Dann gib
  "titel": [{box: [x0, y0, x1, y1], farbe: "#rrggbb"}] für diesen Schriftzug an (Farbe der Buchstaben, je Farbe ein
  Eintrag) – er wird wieder vor die Figuren gelegt.
- Wirkt es wie ein fertiges Thumbnail (Figur gut sichtbar, Gesicht frei, nichts Seltsames)?

Die Szene (Bildkoordinaten 0–1, oben links = 0,0; kopf = Mitte des Kopfes, kopf_anteil = Kopfhöhe als Anteil der
Bildhöhe; freunde = weitere Figuren mit denselben Feldern${o.minecraft ? `; pose = Posen-Name oder Winkel arm_r/arm_l {heben, seitlich, drehen,
beugen}, bein_r/bein_l {vor, seitlich, beugen}, koerper {drehen, vor, neigen}, kopf {drehen, nicken, neigen}, kippen
(zur Kamera hin/weg), kippen_seite (Neigung in der Bildebene, positiv = Kopf nach rechts, 60–90 = liegt waagerecht im
Bild); blick = Körperdrehung in Grad von −90 bis 90, positiv = zur rechten Bildseite (die Rückansicht nie über blick,
nur über "ansicht": "hinten"); verbindungen = [{von, zu, art, von_punkt, zu_punkt}] mit "ich"/"freund0"…, Punkte
huefte, hand_r, hand_l, hals, fuss_r, fuss_l` : ''}):
${JSON.stringify(zeigen, null, 1)}

Antworte nur mit JSON: {"passt": true|false, "probleme": ["kurz"], "korrektur": {nur die Felder, die sich ändern müssen –
z. B. "kopf_anteil", "kopf"${o.minecraft ? ', "pose", "blick", "haende"' : ''}, "freunde": [{…} je Freund oder null], ${o.minecraft ? '"verbindungen", ' : ''}"reste", "titel"}}.
${o.minecraft ? `Liegen Hände falsch (Klettern, Greifen, Ausholen), gib "haende": [[u, v], …] mit den Handpositionen aus dem ORIGINAL an –
die Arme werden genau dorthin gerichtet; das ist genauer als Winkel in "pose".
` : ''}Größer machen = kopf_anteil erhöhen. Passt alles, "passt": true und keine Korrektur.`
}

/** Lädt ein Poly-Haven-Modell (glTF 1k, CC0) in den lokalen Ordner und trägt die Lizenz ins Protokoll ein */
export async function ladeRequisit(suchwort: string, props: string): Promise<string | null> {
  const liste = (await (await fetch('https://api.polyhaven.com/assets?t=models')).json()) as Record<string, { name?: string; tags?: string[]; categories?: string[] }>
  const ersatz = ersatzSuchwort(suchwort)
  const id = besterTreffer(liste, suchwort) ?? (ersatz ? besterTreffer(liste, ersatz) : null)
  if (!id) return null
  const ordner = join(props, id)
  const dateien = (await (await fetch(`https://api.polyhaven.com/files/${id}`)).json()) as { gltf?: Record<string, { gltf?: { url: string; include?: Record<string, { url: string }> } }> }
  const g = dateien.gltf?.['1k']?.gltf ?? dateien.gltf?.['2k']?.gltf
  if (!g) return null
  const ziel = join(ordner, g.url.split('/').pop()!)
  if (!(await existiert(ziel))) {
    const laden = async (url: string, pfad: string): Promise<void> => {
      await mkdir(join(pfad, '..'), { recursive: true })
      const r = await fetch(url)
      if (!r.ok) throw new Error(`Poly Haven: ${url} → ${r.status}`)
      await writeFile(pfad, Buffer.from(await r.arrayBuffer()))
    }
    await laden(g.url, ziel)
    for (const [pfad, datei] of Object.entries(g.include ?? {})) await laden(datei.url, join(ordner, ...pfad.split('/')))
    await appendFile(join(props, 'lizenzen.md'), `- ${id} – Poly Haven (polyhaven.com/a/${id}), CC0, geladen ${new Date().toISOString().slice(0, 10)}\n`)
  }
  return ziel
}

/** Körper und Kopf nur in natürlichen Grenzen drehen */
export function begrenzeWinkel(w: Record<string, unknown>): Record<string, unknown> {
  const grenze: Record<string, number> = { koerper: 60, kopf: 70 }
  const neu: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(w)) {
    if (k === 'blick') continue
    if (grenze[k] && v && typeof v === 'object') {
      const g = { ...(v as Record<string, number>) }
      if (typeof g['drehen'] === 'number') g['drehen'] = Math.max(-grenze[k]!, Math.min(grenze[k]!, g['drehen']))
      neu[k] = g
    } else neu[k] = v
  }
  return neu
}

/**
 * Kopfgröße (Anteil der Bildhöhe) für einen Minecraft-Skin: so groß, dass die Figur (etwa 2,2 Kopfbreiten breit) die
 * entfernte Person weitgehend abdeckt. Ein Minecraft-Kopf ist ein Viertel der Figurhöhe (ein Mensch etwa ein Siebtel).
 */
export function kopfAnteil(geschaetzt: number | undefined, person: { box?: Box; hoehe?: number }): number {
  const basis = Math.min(0.7, Math.max(0.15, geschaetzt || 0.35, (person.hoehe ?? 0) * 0.25))
  const b = person.box
  const ausBreite = b ? ((b[2] - b[0]) * 1280) / 2.2 / 720 : 0
  return Math.min(0.6, Math.max(basis, Math.min(ausBreite, basis * 1.15)))
}

/** Deckt die Figur weniger als 55 % der entfernten Person ab, wird sie größer (höchstens Kopf 70 % der Bildhöhe) */
export function groesserBeiLuecke(kopf: number, deckung: number | undefined): number {
  if (deckung === undefined || deckung >= 0.55) return kopf
  const faktor = Math.min(1.6, Math.max(1.2, Math.sqrt(0.65 / Math.max(deckung, 0.01))))
  return Math.min(0.7, Math.round(kopf * faktor * 1000) / 1000)
}

/** Titel, die wirklich über der Person liegen: gültige Farbe und höchstens ein Drittel der Bildfläche */
export function echteTitel(a: Pick<VorlagenAnalyse, 'titel'>): { box: Box; farbe: string }[] {
  return (a.titel ?? []).filter((x) => x.box.length === 4 && (x.box[2]! - x.box[0]!) * (x.box[3]! - x.box[1]!) <= 0.33) as { box: Box; farbe: string }[]
}

export function titelArgumente(a: Pick<VorlagenAnalyse, 'titel'>): string[] {
  return echteTitel(a).map((x) => `farbe=${x.farbe}:${x.box.join(',')}`)
}

/** Freunde: an der Stelle weiterer Personen der Vorlage, sonst daneben auf der Seite mit mehr Platz */
export function freundePlaetze(a: Pick<VorlagenAnalyse, 'kopf' | 'kopf_anteil' | 'weitere' | 'ansicht'>, freunde: { skin: string | null; slim?: boolean | null }[]): Record<string, unknown>[] {
  const [u, v] = a.kopf as [number, number]
  const seite = u < 0.5 ? 1 : -1
  return freunde.map((f, i) => {
    const w = a.weitere?.[i]
    if (w)
      return {
        skin: f.skin,
        slim: f.slim ?? null,
        kopf: w.kopf,
        kopf_anteil: Math.min(0.6, Math.max(0.1, w.kopf_anteil)),
        pose: w.winkel && Object.keys(w.winkel).length ? begrenzeWinkel(w.winkel) : (w.pose ?? 'neutral'),
        ansicht: w.ansicht ?? 'vorn',
        ...(typeof w.blick === 'number' ? { blick: w.blick } : {}),
        ...(gueltigeHaende(w.haende).length ? { haende: gueltigeHaende(w.haende) } : {})
      }
    const versatz = (i - (a.weitere?.length ?? 0) + 1) * 0.24
    return { skin: f.skin, slim: f.slim ?? null, kopf: [Math.min(0.9, Math.max(0.1, u + seite * versatz)), v + 0.02], kopf_anteil: a.kopf_anteil * 0.85, pose: 'neutral', ansicht: a.ansicht ?? 'vorn', blick: -seite * 15 }
  })
}

export function analysePrompt(posen: string[], beispiele: string, o: { minecraft: boolean; freunde: string[]; wunsch: string | null }): string {
  return `Die Person des Creators soll in dieses vorhandene Thumbnail, genau an die Stelle der Person darin${o.minecraft ? ' (als Minecraft-Figur)' : ' (als freigestelltes Foto)'}.
Das Bild kann alles zeigen: echte Menschen, gerenderte Spielfiguren, Comic, Roboter, Tiere mit Körper; eine oder mehrere
Personen; von vorn, von der Seite oder von hinten; stehend, springend, kletternd, hängend, sitzend, liegend, fallend.
Die Person, die ersetzt wird, ist die wichtigste (meist die größte oder die im Vordergrund).

Bestimme (Bildkoordinaten 0–1, oben links = 0,0):
- inhalt: kurz, was das Thumbnail zeigt
- box: [x0, y0, x1, y1] Kasten um die GANZE Person – mit Kopf, ausgestreckten Armen, Beinen und dem, was sie hält; lieber
  etwas zu groß als zu klein (alles darin wird entfernt und ersetzt)
- kopf: [u, v] Mitte des Kopfes der Person; kopf_anteil: Kopfhöhe samt Haaren als Anteil der Bildhöhe
${o.minecraft ? `- pose: passende Pose aus dieser Liste, falls eine genau passt: ${posen.join(', ')}
- winkel: sonst eigene Winkel für den GANZEN Körper (ohne blick – die Drehung des ganzen Körpers steht in blick, die
  Rückansicht in ansicht): arm_r/arm_l {heben, seitlich, drehen, beugen}, bein_r/bein_l {vor, seitlich, beugen},
  koerper {drehen, vor, neigen}, kopf {drehen, nicken, neigen}, kippen (ganzer Körper nach hinten +, nach vorn −, z. B.
  −40 für einen Hechtsprung – zur Kamera hin/weg), kippen_seite (Neigung IN der Bildebene, positiv = Kopf zur rechten
  Bildseite; 60–90 = Körper liegt schräg bis waagerecht im Bild: Fliegen, Fallen, Sprung zur Seite). Beine gehören immer
  dazu, wenn die Person nicht einfach steht (springt, klettert, rennt, sitzt, fällt). Beispiele (drehen positiv = zur
  rechten Bildseite, heben 90 = nach vorn, 90 mit drehen 0 zeigt genau in die Kamera; zur Seite zeigen braucht drehen 40–70):
${beispiele}
- mimik: ${MIMIKEN.join(', ')}
- ansicht: "vorn" oder "hinten"; blick: Körperdrehung in Grad (0 = frontal, positiv = nach rechts)
- haende: [[u, v], …] wo die Hände der Person im Bild sind (jede sichtbare Hand, besonders wenn sie greift, klettert,
  sich festhält oder ausholt) – die Arme der Figur werden genau dorthin gerichtet; verdeckte Hände weglassen
- ziel: [u, v], falls die Person auf etwas zielt oder zeigt
- gegenstand: falls die Person etwas hält: box um den Gegenstand, suchwort (englisch, 1–2 Wörter), hand ("r" = im Bild linke Hand)
` : ''}- licht_seite: von welcher Seite das Hauptlicht kommt
- titel: nur Titel, Schriftzüge und Logos, die VOR der Person liegen, als {box, farbe der Buchstaben "#rrggbb"}; sonst leer
${o.freunde.length ? `- weitere: weitere Personen im Bild (die wichtigsten zuerst, höchstens ${o.freunde.length}), werden durch ${o.freunde.join(' und ')} ersetzt,
  in genau ihrer Größe${o.minecraft ? ' und Haltung' : ''}: box, kopf, kopf_anteil${o.minecraft ? ', pose oder winkel (mit Beinen), ansicht, blick, haende' : ''} wie oben
${o.minecraft ? `- verbindungen: sind Personen miteinander verbunden (Kette, Seil, Leine), je Verbindung {von, zu, art, von_punkt,
  zu_punkt, box}: "ich" = die Person, die ersetzt wird, "freund0", "freund1" … = weitere[0], weitere[1] …; punkt:
  huefte, hand_r, hand_l, hals, fuss_r, fuss_l; box = Kasten um die Verbindung im Bild. Die Verbindung gehört dann NICHT
  in gegenstand – sie wird zwischen den Figuren neu gezeichnet
` : ''}` : ''}${o.wunsch ? `\nWunsch des Creators: „${o.wunsch}“ – berücksichtige ihn.\n` : ''}`
}

async function analysiere(ki: KiSchicht | null, vorlage: string, prompt: string, ctx: JobContext<unknown>): Promise<VorlagenAnalyse | null> {
  if (!ki || !(await ki.verfuegbar(true))) return null
  try {
    return (await ki.frage({ name: 'vorlage-analyse', system: 'You analyse a thumbnail template precisely.', prompt, bilder: [vorlage], schema: VorlagenAnalyseZ, brauchtBilder: true, stufe: 'stark', maxAusgabe: 2000 }, ctx)).daten
  } catch {
    return null
  }
}
/** Höchstens zwei Korrekturen; eine dritte Prüfung berichtet nur noch, sonst stünden die Probleme des vorletzten Bildes im Ergebnis */
export const SCHLUSS_RUNDEN = 3

/**
 * Schlussprüfung (aus MoinStudio v0.41.0): die Bild-KI legt Original und Ergebnis nebeneinander und sagt, was nicht passt
 * und wie es zu korrigieren ist. null ohne Bild-KI oder bei Fehler – dann bleibt es bei der einfachen Bildprüfung.
 */
async function schlusspruefung(ki: KiSchicht | null, vorlage: string, bild: string, prompt: string, ctx: JobContext<unknown>): Promise<SchlussPruefung | null> {
  if (!ki || !(await ki.verfuegbar(true))) return null
  try {
    return (await ki.frage({ name: 'vorlage-pruefung', system: 'You strictly compare a thumbnail template with the result and give precise corrections.', prompt, bilder: [vorlage, bild], schema: PruefungZ, brauchtBilder: true, stufe: 'stark', maxAusgabe: 2000, zeitlimitMs: 10 * 60 * 1000 }, ctx)).daten
  } catch {
    return null
  }
}

export async function vorlageJob(p: ThumbPayload, ctx: JobContext<{ fertig?: VarianteErgebnis[] }>, d: ThumbDienste): Promise<ThumbErgebnisDaten> {
  const c = ctx as JobContext<unknown>
  const u = p.umgebung
  await mkdir(p.ausgabe, { recursive: true })
  const original = join(p.ausgabe, `original${extname(p.start.quelle!).toLowerCase() || '.jpg'}`)
  await copyFile(p.start.quelle!, original)
  const pyU = await sicherePython(u, c, { lama: true })
  ctx.progress(4, t('thumb.schritt.vorlage'))
  const vorlage = join(p.ausgabe, 'vorlage.png')
  await py(pyU, join(u.skripte, 'vorlage_vorbereiten.py'), [original, vorlage], c)

  ctx.progress(8, t('thumb.schritt.original'))
  const mc = p.engine === 'minecraft'
  const freunde = p.figuren.slice(1)
  const wunsch = p.start.beschreibung.trim() || null
  const a = await analysiere(d.ki, vorlage, analysePrompt(await posenNamen(u.skripte), await posenBeispiele(u.skripte, ['pistole', 'zeigen', 'panik', 'hechtsprung', 'klettern', 'sitzen', 'rennen']), { minecraft: mc, freunde: freunde.map((f) => f.name), wunsch }), c)
  if (a) await writeFile(join(p.ausgabe, 'analyse.json'), JSON.stringify(a, null, 1))

  await ctx.yield()
  ctx.progress(25, t('thumb.schritt.personEntfernen'))
  const ersetzt = Math.min(freunde.length, a?.weitere?.length ?? 0)
  let verbindungen = mc && a ? gueltigeVerbindungen(a, ersetzt) : []
  // Gegenstand und Verbindungen werden mit entfernt und neu gezeichnet, Titel bleiben stehen
  const extra = [...(a?.gegenstand?.box ? [a.gegenstand.box] : []), ...verbindungen.flatMap((v) => (v.box ? [v.box] : []))].map((b) => b.join(','))
  let titel = a ? echteTitel(a) : []
  const freistellen = (): Promise<string> =>
    py(pyU, join(u.skripte, 'freistellen.py'), [vorlage, p.ausgabe, ...extra, `--personen=${1 + ersetzt}`, ...(a ? personenArgumente(a, ersetzt) : []), ...titel.map((x) => `--titel=${x.farbe}:${x.box.join(',')}`)], c)
  // Bei knappem Arbeitsspeicher scheitern OpenCV/ONNX gelegentlich („bad allocation“) – kurz warten und noch einmal
  await freistellen().catch(async () => {
    ctx.progress(null, t('thumb.schritt.freistellenNochmal'))
    await new Promise((r) => setTimeout(r, 5000))
    return freistellen()
  })
  const person = await liesJson<FreigestelltePerson & { personen?: FreigestelltePerson[] }>(join(p.ausgabe, 'person.json'), {})
  const mitMaske = (x?: FreigestelltePerson): FreigestelltePerson | undefined => (x?.maske ? { ...x, maske: join(p.ausgabe, x.maske) } : x)
  const kopf = (a?.kopf as [number, number] | undefined) ?? person.kopf ?? [0.3, 0.35]
  const ich = p.figuren[0]!

  let bild: string | null = null
  let bericht: Bericht & { deckung?: number } = {}
  let fehler: string | null = null
  const hintergrund = join(p.ausgabe, 'hintergrund.png')
  const render = join(p.ausgabe, 'render.png')
  let spec: Record<string, unknown>
  let rendereRoh: () => Promise<{ roh: string | null; bericht: Bericht; fehler: string | null }>
  if (mc) {
    if (!u.blender) throw new Error(t('thumb.fehlt.blender'))
    const blender = u.blender
    let requisit: string | null = null
    if (a?.gegenstand?.suchwort) {
      ctx.progress(40, t('thumb.schritt.requisit', { wort: a.gegenstand.suchwort }))
      requisit = await ladeRequisit(a.gegenstand.suchwort, join(u.werkzeugRoot, 'props')).catch(() => null)
    }
    // Ketten und Seile bestehen aus Spieltexturen; ohne Spieldatei bleiben sie weg (die Figuren stehen trotzdem richtig)
    const texturen = verbindungen.length
      ? await sichereMcAssets(join(u.werkzeugRoot, 'mc'), { mojangErlaubt: u.mojangErlaubt, onProgress: (x) => ctx.progress(null, x) }).then(
          (m) => m.textures,
          () => null
        )
      : null
    if (!texturen) verbindungen = []
    const suchwort = a?.gegenstand?.suchwort ?? ''
    const haende = gueltigeHaende(a?.haende)
    spec = {
      hintergrund,
      skin: ich.skin,
      slim: ich.slim,
      pose: a?.winkel && Object.keys(a.winkel).length ? begrenzeWinkel(a.winkel) : (a?.pose ?? 'neutral'),
      mimik: a?.mimik && MIMIKEN.includes(a.mimik) ? a.mimik : undefined,
      kopf,
      kopf_anteil: kopfAnteil(a?.kopf_anteil ?? person.kopf_hoehe, person),
      licht_seite: a?.licht_seite ?? 'rechts',
      ansicht: a?.ansicht ?? 'vorn',
      ...(a?.ziel ? { ziel: a.ziel } : {}),
      ...(typeof a?.blick === 'number' ? { blick: Math.max(-90, Math.min(90, a.blick)) } : {}),
      ...(haende.length ? { haende } : {}),
      requisit: requisit ? { gltf: requisit, hand: a?.gegenstand?.hand ?? 'r', laenge_px: requisitLaenge(suchwort), zielen: zumZielen(suchwort) } : undefined,
      ...(freunde.length
        ? { freunde: freundePlaetze({ kopf, kopf_anteil: a?.kopf_anteil ?? 0.3, weitere: a?.weitere, ansicht: a?.ansicht }, freunde).map((f, i) => (i < ersetzt && person.personen?.[i + 1] ? { ...f, person: mitMaske(person.personen[i + 1]) } : f)) }
        : {}),
      // Mit einer Maske je Person passt Blender jede Figur selbst in ihren Umriss ein
      ...(person.personen ? { person: mitMaske(person.personen[0]) } : {}),
      ...(verbindungen.length ? { verbindungen, texturen } : {}),
      maske: join(p.ausgabe, 'maske.png'),
      samples: Math.min(96, blender.samples),
      geraet: blender.geraet
    }
    // Vorabprüfung ohne Render: deckt die Figur die entfernte Person? Sonst größer (höchstens dreimal). Mit getrennten
    // Personen entfällt das, Blender passt die Figuren selbst ein.
    for (let versuch = 0; versuch < (person.personen ? 0 : 3); versuch++) {
      await writeFile(join(p.ausgabe, 'pruefung.json'), JSON.stringify({ ...spec, nur_pruefen: true }, null, 1))
      await runBlender({ exe: blender.exe, mesa: blender.mesa, script: join(u.skripte, 'render_vorlage.py'), args: [join(p.ausgabe, 'pruefung.json'), render, join(p.ausgabe, 'pruefung.bericht.json')] }, c)
      const pr = await liesJson<{ deckung?: number }>(join(p.ausgabe, 'pruefung.bericht.json'), {})
      const neu = groesserBeiLuecke(spec['kopf_anteil'] as number, pr.deckung)
      if (neu === spec['kopf_anteil']) break
      spec['kopf_anteil'] = neu
    }
    rendereRoh = async () => {
      await writeFile(join(p.ausgabe, 'spec.json'), JSON.stringify(spec, null, 1))
      const r = await runBlender({ exe: blender.exe, mesa: blender.mesa, script: join(u.skripte, 'render_vorlage.py'), args: [join(p.ausgabe, 'spec.json'), render, join(p.ausgabe, 'bericht.json')] }, c)
      const b = await liesJson<Bericht & { deckung?: number }>(join(p.ausgabe, 'bericht.json'), {})
      const ok = r.code === 0 && !b.fehler
      return { roh: ok ? render : null, bericht: b, fehler: ok ? null : (b.fehler ?? `Blender ${r.code}`) }
    }
  } else {
    // Foto: Person freigestellt an die Stelle der alten Person, Kopfgröße wie dort; korrigierbar sind Lage und Größe
    const kopfAnt = Math.min(0.6, Math.max(0.12, a?.kopf_anteil ?? person.kopf_hoehe ?? 0.3))
    spec = {
      kopf,
      kopf_anteil: kopfAnt,
      freunde: freunde.map((_, i) => {
        const w = a?.weitere?.[i]
        return { kopf: w?.kopf ?? [Math.min(0.9, kopf[0] + 0.25 * (i + 1)), kopf[1] + 0.02], kopf_anteil: w?.kopf_anteil ?? kopfAnt * 0.85 }
      })
    }
    const figur = (f: (typeof p.figuren)[number], s: Record<string, unknown>): Record<string, unknown> => {
      const k = s['kopf'] as [number, number]
      return { id: f.id, bild: f.fotos[0], freistellen: true, modell: f.mensch ? 'u2net_human_seg' : 'isnet-general-use', art: f.mensch ? 'foto' : 'bild', mitte_x: k[0], kopf_y: k[1], kopf_anteil: s['kopf_anteil'], rand: 2 }
    }
    rendereRoh = async () => {
      const fs = spec['freunde'] as Record<string, unknown>[]
      const personen = [figur(ich, spec), ...freunde.map((f, i) => figur(f, fs[i]!))].filter((x) => x['bild'])
      const r = await renderFoto(pyU, u, { breite: 1280, hoehe: 720, hintergrund: { art: 'bild', pfad: hintergrund }, personen, licht_angleichen: 0.3, look: { kontrast: 1.02, saettigung: 1.02, vignette: 0 } }, join(p.ausgabe, 'variante-1'), c)
      if (!r.roh) return r
      await copyFile(r.roh, render)
      return { ...r, roh: render }
    }
  }

  // Titel der Vorlage wieder obendrauf
  const fertigMachen = async (roh: string): Promise<string> => {
    const args = titelArgumente({ titel })
    if (!args.length) return roh
    ctx.progress(null, t('thumb.schritt.titel'))
    const fertigBild = join(p.ausgabe, 'fertig.png')
    return py(pyU, join(u.skripte, 'vorlage_titel.py'), [vorlage, roh, fertigBild, ...args, `--maske=${join(p.ausgabe, 'maske.png')}`], c).then(
      () => fertigBild,
      () => roh
    )
  }
  const rendern = async (fortschritt: number): Promise<void> => {
    ctx.progress(fortschritt, t('thumb.schritt.variante', { nr: 1, von: 1, titel: a?.inhalt ?? '' }))
    const r = await rendereRoh()
    bericht = r.bericht
    fehler = r.fehler
    bild = r.roh ? await fertigMachen(r.roh) : null
  }
  await rendern(55)

  // Schlussprüfung: Original und Ergebnis nebeneinander, korrigieren, was nicht passt (aus MoinStudio v0.41.0)
  const probleme: string[] = []
  let geprueft = false
  let korrekturen = 0
  for (let runde = 0; runde < SCHLUSS_RUNDEN && bild; runde++) {
    await ctx.yield()
    ctx.progress(75 + runde * 7, t('thumb.schritt.vergleich'))
    const urteil = await schlusspruefung(d.ki, vorlage, bild, pruefPrompt(spec, { minecraft: mc, wunsch }), c)
    if (!urteil) break
    geprueft = true
    await writeFile(join(p.ausgabe, `pruefung-${runde + 1}.json`), JSON.stringify(urteil, null, 1))
    probleme.splice(0, probleme.length, ...(urteil.probleme ?? []))
    const k = urteil.korrektur
    if (urteil.passt || !k || !Object.keys(k).length || runde === SCHLUSS_RUNDEN - 1) break
    korrigiere(spec, k, mc ? 'minecraft' : 'foto')
    // Reste der alten Person (Hand, Gurt, Waffe), die die Maske verpasst hat: zusätzlich entfernen und neu auffüllen
    const reste = gueltigeReste(k)
    if (reste.length) {
      ctx.progress(null, t('thumb.schritt.reste'))
      extra.push(...reste.map((b) => b.join(',')))
      await freistellen().catch(() => undefined)
    }
    // Logo oder Titel, das die Figur verdeckt: wieder vor die Figuren legen
    const neueTitel = echteTitel({ titel: VorlagenAnalyseZ.shape.titel.safeParse(k['titel']).data })
    if (neueTitel.length) titel = [...titel, ...neueTitel]
    korrekturen++
    await rendern(78 + runde * 7)
  }

  const warnungen = mc && bericht.deckung !== undefined && bericht.deckung < 0.45 ? [t('thumb.vorlage.deckung', { anteil: Math.round(bericht.deckung * 100) })] : []
  // Logo der Marke zuletzt in eine freie Ecke – nie über Figuren, Titeln oder Gegenständen (aus MoinStudio v0.38.0)
  let logoBox: Box | null = null
  if (bild && p.marke.logo) {
    const kopfBox = (bericht as { kopf_box?: Box }).kopf_box
    const sperren: Box[] = [
      ...titel.map((x) => x.box),
      ...[a?.box, ...(a?.weitere ?? []).map((w) => w.box), a?.gegenstand?.box].filter((b): b is number[] => b?.length === 4).map((b) => b as Box),
      ...(person.personen ?? [person]).flatMap((x) => (x.box ? [x.box] : [])),
      ...(kopfBox ? [kopfBox] : [])
    ]
    const tl = await setzeTextUndLogo(u, null, bild, { ...bericht, grafik_boxen: [...(bericht.grafik_boxen ?? []), ...sperren] }, { texte: [], logo: p.marke.logo, logoPlatz: p.marke.logoPlatz }, join(p.ausgabe, 'logo'), c)
    bild = tl.bild
    logoBox = tl.logoBox
    warnungen.push(...tl.warnungen)
  }
  const technisch = bild ? await technischePruefung(bild, bericht, { textBoxen: [], logoBox, engineWarnungen: [...(bericht.warnungen ?? []), ...warnungen] }) : []
  // Hat die Schlussprüfung schon geurteilt, stehen ihre offenen Punkte als Befund der Bild-KI da
  const kiB = bild && !geprueft ? await kiPruefung(d.ki, bild, { beschreibung: a?.inhalt ?? p.start.beschreibung, sprache: sprachName(p.sprache) }, c) : null
  ctx.progress(100, t('jobs.schritt.fertig'))
  return {
    varianten: [
      {
        titel: t('thumb.vorlage.titel', { inhalt: a?.inhalt ?? '' }).slice(0, 90),
        warum: a ? a.inhalt : t('thumb.vorlage.ohneKi'),
        vorbild: 'vorlage',
        bild,
        roh: render,
        spec: join(p.ausgabe, mc ? 'spec.json' : 'variante-1.spec.json'),
        ebenen: mc ? null : join(p.ausgabe, 'variante-1.ebenen'),
        bericht: join(p.ausgabe, mc ? 'bericht.json' : 'variante-1.bericht.json'),
        texte: [],
        schriftAssets: null,
        engine: p.engine,
        pruefung: { technisch: technisch.map((b) => b.text), ki: geprueft ? probleme : kiB ? kiB.map((b) => b.text) : null, korrekturen },
        fehler
      }
    ]
  }
}
