// Herkunft: MoinStudio src/main/schnitt/bearbeiten.ts (MIT), auf die KI-Schicht und den Stil je Richtung umgestellt.
import { alsBausteine, ladeBibliothek, passtZu, type BibEffekt } from './bibliothek'
import { execFile } from 'node:child_process'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { KiSchicht } from '../ki/schicht'
import { hauptSprache, t } from '../i18n'
import { sprachName } from '../thumbnail/job'
import { stilFuer, stilText } from './stil'
import type { JobContext } from '../jobs/queue'
import { aendereProjekt, ladeProjekt, projektOrdner } from './projekt'
import { schnittliste, type Entfernt, type Schnittliste } from './rohschnitt'
import { liesAbschnitte } from './transkript'
import { pruefeEffekte, type Effekt } from './effekte'
import { ladeEffekte } from './effekt-vorbereitung'
import { KLAENGE } from './klaenge'
import { lauteMomente } from './highlights'
import { liesMitKonfliktkopien } from '../data/jsonfile'

/**
 * Schnitt prüfen und ändern (ROADMAP 5.2, 5.4): Schnittstellen an/aus, Sätze raus oder zurück, Änderungswunsch in Worten.
 * Ausgeschaltete Stellen bleiben in der Liste (aus = true), damit man sie jederzeit wieder einschalten kann.
 */

/** Behalten-Bereiche aus den aktiven (nicht ausgeschalteten) Schnitten neu berechnen. */
export function neuBerechnen(liste: Schnittliste): Schnittliste {
  const aktiv = liste.entfernt.filter((e) => !e.aus)
  return { ...schnittliste(liste.dauer, aktiv), entfernt: [...liste.entfernt].sort((a, b) => a.start - b.start) }
}

/** Eine Schnittstelle an- oder ausschalten. */
export function umschalten(liste: Schnittliste, index: number): Schnittliste {
  const entfernt = liste.entfernt.map((e, i) => (i === index ? { ...e, aus: !e.aus } : e))
  return neuBerechnen({ ...liste, entfernt })
}

/**
 * Bereich rausnehmen (raus = true) oder zurückholen (raus = false). Zurückholen schaltet alle Schnitte im Bereich aus;
 * ragt ein von Hand gesetzter Schnitt nur teilweise hinein, wird er gekürzt.
 */
export function bereichSetzen(liste: Schnittliste, start: number, ende: number, raus: boolean, text?: string): Schnittliste {
  const a = Math.max(0, Math.min(start, ende))
  const b = Math.min(liste.dauer, Math.max(start, ende))
  if (b - a < 0.05) return liste
  let entfernt: Entfernt[]
  if (raus) {
    entfernt = [...liste.entfernt, { start: a, ende: b, grund: 'manuell', ...(text ? { text } : {}) }]
  } else {
    entfernt = liste.entfernt.flatMap((e): Entfernt[] => {
      if (e.aus || e.ende <= a || e.start >= b) return [e]
      if (e.grund === 'manuell' && (e.start < a || e.ende > b)) {
        const teile: Entfernt[] = []
        if (e.start < a) teile.push({ ...e, ende: a })
        if (e.ende > b) teile.push({ ...e, start: b })
        return teile
      }
      return [{ ...e, aus: true }]
    })
  }
  return neuBerechnen({ ...liste, entfernt })
}

export interface WunschPayload {
  daten: string
  projekt: string
  wunsch: string
  /** Für den Sichtbogen (die Bild-KI sieht Standbilder aus dem Video) */
  ffmpeg?: string
  /** Markenschrift für Text-Einblendungen (Name, für die Beschreibung an die KI) */
  schrift?: string | null
  /** Konto mit Minecraft-Skin: Skin-Sting im Intro möglich (aus MoinStudio v0.45.0) */
  sting?: boolean
}

/** Sichtbogen: Standbilder aus dem Original im Raster, damit die Bild-KI Stellen im Bild findet (Explosion, Ort, Gesicht). */
export function sichtRaster(dauer: number): { anzahl: number; spalten: number; zeilen: number; abstand: number } {
  const anzahl = dauer > 600 ? 80 : 40
  const spalten = anzahl === 80 ? 10 : 8
  return { anzahl, spalten, zeilen: anzahl / spalten, abstand: dauer / anzahl }
}

async function sichtbogen(ffmpeg: string, quelle: string, ordner: string, dauer: number): Promise<string | null> {
  const datei = join(ordner, 'sicht.jpg')
  if (await stat(datei).catch(() => null)) return datei
  const r = sichtRaster(dauer)
  return new Promise((resolve) =>
    execFile(ffmpeg, ['-y', '-v', 'error', '-i', quelle, '-vf', `fps=${r.anzahl}/${dauer.toFixed(3)},scale=240:-2,tile=${r.spalten}x${r.zeilen}`, '-frames:v', '1', '-q:v', '4', datei], { windowsHide: true, timeout: 300_000 }, (err) => resolve(err ? null : datei))
  )
}

const WunschZ = z.object({
  schritte: z.array(z.object({ art: z.enum(['entfernen', 'zurueck']), von: z.number(), bis: z.number(), warum: z.string().optional() })),
  effekte: z.array(z.looseObject({ art: z.string() })),
  antwort: z.string()
})

const t2 = (s: number): string => s.toFixed(2)

/** Beschreibung der Bausteine für die KI – frei kombinierbar, keine feste Effektliste */
export function bausteinText(schrift: string | null = null, sting = false): string {
  return `- tempo {von, bis, faktor}: 0.25–4 (0.5 = Zeitlupe, 2 = doppelt so schnell)
- einfrieren {bei, dauer}: Standbild für dauer Sekunden (Ton pausiert)
- zoom {von, bis, faktor 1–4, x, y}: sanft auf einen Bildpunkt (x, y 0–1, 0.5 = Mitte)
- wackeln {von, bis, staerke 0.1–1}: Kamerawackeln (Explosion, Schreck, Treffer)
- farbe {von, bis, saettigung 0–3, kontrast 0.3–2.5, helligkeit -0.6–0.6, schwarzweiss true, ton warm|kalt|rot|gruen|blau}
- blitz {bei, dauer 0.05–1, farbe weiss|schwarz}: kurzer Blitz (Treffer, Explosion, Enthüllung)
- uebergang {bei, dauer, farbe weiss|schwarz}: kurze Abblende und wieder auf, z. B. an einem Szenenwechsel
- abblende {von, bis, richtung aus|ein, farbe schwarz|weiss}: Ausblenden, das dunkel bleibt (Ende), oder Einblenden aus Schwarz (Anfang); der Ton geht mit
- text {von, bis, text, lage oben|mitte|unten, farbe #rrggbb, groesse 0.07–0.4 (Zeilenhöhe als Anteil der Bildhöhe, 0.12 ist gut lesbar), animation pop|fest}: Einblendung in der Schrift der Marke${schrift ? ` (${schrift})` : ''} (1–4 Wörter wirken am besten)
- geraeusch {bei, klang, lautstaerke 0–3}: Klänge: ${Object.entries(KLAENGE)
    .map(([k, v]) => `${k} (${v.beschreibung})`)
    .join(', ')}
- video {bei, datei, lage oben|mitte|unten|links|rechts|oben-links|oben-rechts|unten-links|unten-rechts|voll, groesse 0.1–1, ton}: Video mit durchsichtigem Hintergrund einblenden, läuft ab „bei“ einmal durch (groesse 1 = ganzes Bild, ton true = sein Ton läuft mit). datei nur aus der Effekt-Bibliothek (unten)
- zensur {von, bis}: Bild unscharf, Ton stumm, Piep darüber
- lautstaerke {von, bis, faktor 0–4}: lauter oder leiser
- intro {teile, klang}: Vorspann vor dem Video, höchstens eins. teile: {art: "clip", von, bis, tempo} = kurzer Moment aus dem Video, {art: "karte", text, dauer 0.5–6, hintergrund unscharf|schwarz, bei, farbe} = Titelkarte (bei = Zeitpunkt für das unscharfe Hintergrundbild). Zwischen Clips kommt automatisch ein Wusch, zur Karte ein Knall (klang: false schaltet das ab).${
    sting
      ? ' {art: "sting", vorlage sprung|winken|schwert, text, dauer 1–4, hintergrund unscharf|schwarz, bei} = die eigene Minecraft-Figur des Creators, animiert (sprung: springt ins Bild und reckt die Faust, winken: winkt in die Kamera, schwert: holt aus und schlägt zur Kamera), darunter der Text (z. B. der Kanalname) mit Wusch, Knall und Ding.'
      : ''
  }`
}

/**
 * Eigene Effekte aus der Bibliothek für die KI (aus MoinStudio v0.50.0): Name und fertige Bausteine mit Verweis, damit
 * „blend die Abo-Animation ein“ genau diesen Effekt setzt. Lage und Größe sind die des Creators, die KI wählt nur die Zeit.
 */
export function bibText(bib: BibEffekt[]): string {
  if (!bib.length) return ''
  const zeilen = bib.map((e) => `- „${e.name}“: ${JSON.stringify(alsBausteine(e, 0, false).map((b) => ({ ...b, bei: undefined, von: undefined, bis: undefined })))}`)
  return `
Effekt-Bibliothek des Creators (eigene Effekte; nimm sie, wenn der Wunsch sie beim Namen nennt oder sie genau passen – Bausteine
genau so übernehmen, nur die Zeit setzen: „bei“, bei Bildern „von“ und „bis“ mit der angegebenen Dauer):
${zeilen.join('\n')}
`
}

export function wunschPrompt(o: { wunsch: string; kanal: string; plattform: string; stil: string; sprache: string; schrift?: string | null; liste: Schnittliste; saetze: { start: number; ende: number; text: string }[]; effekte: Effekt[]; laut: number[]; sicht?: boolean; bibliothek?: BibEffekt[]; sting?: boolean }): string {
  const { liste } = o
  const raus = (a: number, b: number): boolean => liste.entfernt.some((e) => !e.aus && (a + b) / 2 >= e.start && (a + b) / 2 <= e.ende)
  const nachher = liste.behalten.reduce((s, b) => s + b.ende - b.start, 0)
  return `Der Creator schneidet ein Video für den Kanal ${o.kanal} (${o.plattform}). Sein Wunsch: „${o.wunsch}“
${o.stil}

Du kannst (1) Stellen entfernen oder zurückholen und (2) Effekte setzen. Alle Zeiten sind Sekunden der Originalaufnahme
(${t2(liste.dauer)} s lang, nach dem aktuellen Schnitt ${t2(nachher)} s).
Im Video bleiben (Originalzeit): ${liste.behalten.map((b) => `${t2(b.start)}–${t2(b.ende)}`).join(', ') || 'nichts'}.
Das fertige Video beginnt also bei ${t2(liste.behalten[0]?.start ?? 0)} s und endet bei ${t2(liste.behalten.at(-1)?.ende ?? liste.dauer)} s (auch nach dem letzten gesprochenen Satz läuft es weiter).

Transkript (Originalzeit, „[raus]“ = gerade herausgeschnitten):
${o.saetze.map((s) => `[${t2(s.start)}–${t2(s.ende)}]${raus(s.start, s.ende) ? ' [raus]' : ''} ${s.text}`).join('\n') || '(kein Transkript)'}

Laute Momente (Originalzeit): ${o.laut.length ? o.laut.map((s) => `${s}s`).join(', ') : 'keine'}
${o.sicht ? (() => { const r = sichtRaster(liste.dauer); return `\nSo sieht das Video aus: Das mitgeschickte Bild zeigt ${r.anzahl} Standbilder aus dem Original im Raster ${r.spalten} × ${r.zeilen}, von links nach rechts, Zeile für Zeile. Bild k (ab 0) zeigt etwa Sekunde k × ${t2(r.abstand)}. Nutze es, wenn der Wunsch sich auf etwas im Bild bezieht (Explosion, Ort, Gesicht, Gegenstand).\n` })() : ''}
Aktuelle Effekte (Originalzeit): ${JSON.stringify(o.effekte)}

Effekt-Bausteine – frei kombinierbar, beliebig viele, jeder Wunsch lässt sich daraus bauen:
${bausteinText(o.schrift ?? null, !!o.sting)}
${bibText(o.bibliothek ?? [])}
Regeln:
- Setze den Wunsch vollständig um und kombiniere Bausteine frei. Effekte passen zum Stil oben: genau an Höhepunkten
  (Ausrufe, laute Momente, Pointen, wichtige Schritte), nicht überall.
- Ein „Intro“ besteht aus 2–4 der stärksten Momente (je 0.8–2 s, gern mit Tempo) und einer Titelkarte mit kurzem, starkem
  Titel; zusammen 4–8 s. Wie bei großen Kanälen kommt der stärkste Moment zuerst (Cold Open).${
    o.sting
      ? ` Will der Creator sich selbst, seine Figur oder seinen Kanal im Intro („mit mir“, „mit meinem Skin“, „mit Kanalname“),
  nimm statt der Titelkarte einen kurzen „sting“ (2 s, text = Kanalname ${o.kanal} oder ein kurzer Titel) – nie länger als 3 s.`
      : ''
  }
- „Am Ende“ heißt am Ende des fertigen Videos (letzte behaltene Stelle), „am Anfang“ an seinem Beginn – nicht beim
  letzten oder ersten Satz.
- Effekt-Zeiten liegen in Stellen, die im Video bleiben (nicht in [raus]-Stellen, außer du holst sie zurück).
- Behalte bestehende Effekte, außer der Wunsch ändert oder entfernt sie. „effekte“ ist immer die vollständige neue Liste.
- „schritte“: entfernen/zurueck mit [von, bis] nur, wenn der Wunsch den Schnitt selbst betrifft, sonst leer.
- „antwort“: ein kurzer Satz auf ${o.sprache} für den Creator, was du gemacht hast. Ist etwas unklar oder unmöglich, setze um, was geht,
  und sag es in der Antwort.
Antworte nur mit JSON nach dem Schema.`
}

export async function wunschJob(p: WunschPayload, ctx: JobContext<unknown>, d: { ki: KiSchicht | null }): Promise<{ projekt: string; antwort: string; effekte: number }> {
  if (!d.ki || !(await d.ki.kandidaten()).length) throw new Error(t('schnitt.fehler.ohneKi'))
  const pr = await ladeProjekt(p.daten, p.projekt)
  if (!pr) throw new Error(t('schnitt.fehler.projekt'))
  const ordner = projektOrdner(p.daten, p.projekt)
  let liste = JSON.parse(await liesMitKonfliktkopien(join(ordner, 'schnitt.json'))) as Schnittliste
  const saetze = liesAbschnitte(await readFile(join(ordner, 'transkript.jsonl'), 'utf8').catch(() => ''))
  const wellen = pr.wellenform ? (JSON.parse(await readFile(join(ordner, 'wellenform.json'), 'utf8').catch(() => 'null')) as { aufloesung: number; werte: number[] } | null) : null
  const effekte = await ladeEffekte(ordner, liste.dauer)
  ctx.progress(10, t('schnitt.schritt.wunsch'))
  // Sichtbogen nur, wenn eine Bild-KI da ist
  const sicht = p.ffmpeg && pr.quelle && (await d.ki.verfuegbar(true)) ? await sichtbogen(p.ffmpeg, pr.proxy ? join(ordner, 'proxy.mp4') : pr.quelle.pfad, ordner, liste.dauer) : null
  const bibliothek = (await ladeBibliothek(p.daten)).filter((e) => passtZu(e, pr.kontoId, pr.richtung))
  const basis = { bibliothek, wunsch: p.wunsch, kanal: pr.kanal, plattform: pr.plattform, stil: stilText(stilFuer([pr.richtung], pr.einstellungen?.format ?? '16:9'), [pr.richtung], pr.einstellungen?.format ?? '16:9'), sprache: sprachName(hauptSprache()), schrift: p.schrift ?? null, liste, saetze, effekte, laut: lauteMomente(wellen), sicht: !!sicht, sting: !!p.sting }
  let prompt = wunschPrompt(basis)
  let a: { schritte?: { art: 'entfernen' | 'zurueck'; von: number; bis: number; warum?: string }[]; effekte?: unknown; antwort?: string } = {}
  let geprueft: Effekt[] = effekte
  for (let versuch = 0; versuch < 2; versuch++) {
    const e = await d.ki.frage({ name: 'schnitt-wunsch', system: 'You edit a video by producing a cut list and effect building blocks as JSON.', prompt, bilder: sicht ? [sicht] : [], brauchtBilder: !!sicht, schema: WunschZ, stufe: 'stark', maxAusgabe: 8000 }, ctx)
    a = e.daten
    const r = pruefeEffekte(a.effekte ?? effekte, liste.dauer)
    geprueft = r.effekte
    if (!r.fehler.length) break
    ctx.progress(50, t('schnitt.schritt.wunschKorrektur'))
    prompt = `${wunschPrompt(basis)}\n\n# Korrektur\nDeine letzte Antwort hatte diese Fehler, behebe sie:\n${r.fehler.map((f) => `- ${f}`).join('\n')}`
  }
  for (const s of a.schritte ?? []) liste = bereichSetzen(liste, s.von, s.bis, s.art === 'entfernen', s.warum)
  await writeFile(join(ordner, 'schnitt.json'), JSON.stringify(liste, null, 1))
  await writeFile(join(ordner, 'effekte.json'), JSON.stringify(geprueft, null, 1))
  await aendereProjekt(p.daten, p.projekt, () => ({ antwort: { wunsch: p.wunsch, text: a.antwort ?? t('schnitt.erledigt'), zeit: new Date().toISOString() } }))
  ctx.progress(100, t('jobs.schritt.fertig'))
  return { projekt: p.projekt, antwort: a.antwort ?? t('schnitt.erledigt'), effekte: geprueft.length }
}
