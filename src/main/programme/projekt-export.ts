// Herkunft: MoinStudio src/main/adobe/premiere-export.ts (MIT), erweitert um After Effects, DaVinci Resolve und CapCut.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { t } from '../i18n'
import { liesMitKonfliktkopien } from '../data/jsonfile'
import { effekteInSchnittzeit } from '../schnitt/effekte'
import { ladeEffekte } from '../schnitt/effekt-vorbereitung'
import type { ExportErgebnis } from '../schnitt/export'
import { ladeProjekt, projektOrdner } from '../schnitt/projekt'
import { sauber, untertitelGruppen, zoomsAus } from '../schnitt/render'
import type { Schnittliste } from '../schnitt/rohschnitt'
import { liesAbschnitte } from '../schnitt/transkript'
import { einstellungen } from '../schnitt/vorschau'
import { afterEffectsSkript } from './aftereffects'
import type { CapcutEingabe } from './capcut'
import { premiereXml, srt, type PremiereOptionen } from './premiere'
import { premiereMedien, type MedienWerkzeuge } from './premiere-medien'
import { resolveEdl, resolveFcpxml } from './resolve'
import { quelleFuerProgramme } from './geraet'

/** Breite und Höhe aus dem PNG-Kopf (IHDR); null, wenn es kein PNG ist */
export function pngGroesse(b: Buffer): { breite: number; hoehe: number } | null {
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47 || b.toString('ascii', 12, 16) !== 'IHDR') return null
  return { breite: b.readUInt32BE(16), hoehe: b.readUInt32BE(20) }
}

export type ZielProgramm = 'premiere' | 'aftereffects' | 'resolve' | 'capcut'

/** Alles, was die Programme aus einem Schnitt-Projekt brauchen: Schnitt, Zooms, Kapitel, Effekte, Texte, Untertitel */
export async function projektFuerProgramme(daten: string, id: string): Promise<{ optionen: PremiereOptionen; untertitel: { start: number; ende: number; text: string }[]; ordner: string }> {
  const p = await ladeProjekt(daten, id)
  if (!p?.quelle || !p.rohschnitt) throw new Error(t('schnitt.fehler.erstRohschnitt'))
  const ordner = projektOrdner(daten, p.id)
  const liste = JSON.parse(await liesMitKonfliktkopien(join(ordner, 'schnitt.json'))) as Schnittliste
  const abschnitte = liesAbschnitte(await readFile(join(ordner, 'transkript.jsonl'), 'utf8').catch(() => ''))
  const wellen = p.wellenform ? (JSON.parse(await readFile(join(ordner, 'wellenform.json'), 'utf8')) as { aufloesung: number; werte: number[] }) : null
  const exp = p.export ? (JSON.parse(await readFile(join(ordner, 'export.json'), 'utf8').catch(() => 'null')) as ExportErgebnis | null) : null
  // ohne Emojis und verbotene Zeichen: Dateiname und Sequenzname müssen überall funktionieren
  const name =
    (exp?.titel[0] ?? p.name)
      .replace(/\p{Extended_Pictographic}|️|[\\/:*?"<>|]/gu, '')
      .replace(/\s+/g, ' ')
      .trim() || p.id
  // Effekte in Schnittzeit; Text-Bilder aus der letzten Vorschau, wenn sie nicht älter als die Effekte sind
  const effekte = effekteInSchnittzeit(await ladeEffekte(ordner, liste.dauer), liste.behalten)
  const stand = (await stat(join(ordner, 'effekte.json')).catch(() => null))?.mtimeMs ?? 0
  const textBilder: Record<string, { datei: string; breite: number; hoehe: number }> = {}
  for (const [i, e] of effekte.entries()) {
    if (e.art !== 'text') continue
    const datei = join(ordner, 'effekte', `text${i}.png`)
    const info = await stat(datei).catch(() => null)
    const groesse = info && info.mtimeMs >= stand ? pngGroesse(await readFile(datei)) : null
    if (groesse) textBilder[String(i)] = { datei, ...groesse }
  }
  // Pfad für dieses Gerät: Rohvideo notfalls als Kopie im Projektordner, damit es auf jedes Gerät kommt
  const quelle = { ...p.quelle, pfad: await quelleFuerProgramme(daten, ordner, p.quelle.pfad, p.quelle.groesse) }
  const untertitel = untertitelGruppen(abschnitte, liste, 7).map((g) => ({ start: g.start, ende: g.ende, text: g.woerter.map((w) => sauber(w.wort)).join(' ') }))
  return {
    optionen: { name, quelle, liste, zooms: einstellungen(p).zooms ? zoomsAus(abschnitte, liste, wellen) : [], kapitel: exp?.kapitel ?? [], effekte, textBilder },
    untertitel,
    ordner
  }
}

/**
 * Schreibt die Dateien für Premiere, After Effects oder Resolve nach <Projekt>/programme/; gibt die Hauptdatei zurück.
 * Mit `werkzeuge` (FFmpeg) bekommt Premiere die Bibliotheks-Effekte und Geräusche als echte Clips (aus MoinStudio v0.55.0).
 */
export async function programmDateien(daten: string, id: string, ziel: Exclude<ZielProgramm, 'capcut'>, werkzeuge: MedienWerkzeuge | null = null): Promise<{ datei: string; weitere: string[] }> {
  const { optionen, untertitel, ordner } = await projektFuerProgramme(daten, id)
  if (ziel === 'premiere' && optionen.effekte?.length) Object.assign(optionen, await premiereMedien(daten, join(ordner, 'programme', 'medien'), optionen.effekte, werkzeuge).catch(() => ({})))
  const aus = join(ordner, 'programme')
  await mkdir(aus, { recursive: true })
  const weitere: string[] = []
  if (untertitel.length) {
    const s = join(aus, `${optionen.name}.srt`)
    await writeFile(s, srt(untertitel))
    weitere.push(s)
  }
  const datei = join(aus, ziel === 'premiere' ? `${optionen.name}.xml` : ziel === 'aftereffects' ? `${optionen.name}.jsx` : `${optionen.name}.fcpxml`)
  await writeFile(datei, ziel === 'premiere' ? premiereXml(optionen) : ziel === 'aftereffects' ? afterEffectsSkript(optionen) : resolveFcpxml(optionen))
  if (ziel === 'resolve') {
    const edl = join(aus, `${optionen.name}.edl`)
    await writeFile(edl, resolveEdl(optionen))
    weitere.push(edl)
  }
  return { datei, weitere }
}

/** Eingabe für den CapCut-Ordner aus einem Schnitt-Projekt */
export async function capcutEingabe(daten: string, id: string, ziel: string, ffmpeg: string): Promise<CapcutEingabe> {
  const { optionen, untertitel } = await projektFuerProgramme(daten, id)
  return { quelle: optionen.quelle.pfad, behalten: optionen.liste.behalten, untertitel, kapitel: optionen.kapitel, effekte: optionen.effekte ?? [], titel: optionen.name, ziel: join(ziel, optionen.name), ffmpeg }
}
