// Herkunft: MoinStudio src/main/schnitt/render.ts (MIT), erweitert um Hochformat-Verfolgung, Spuren und Markenschrift.
import type { Abschnitt } from './transkript'
import type { Bereich, Schnittliste } from './rohschnitt'
import { effektGraph, type Effekt, type EffektGraph } from './effekte'

/**
 * Rendern des Schnitts (ROADMAP 5.4, 5.7) in einem FFmpeg-Durchgang: behaltene Stellen auswählen (select/aselect),
 * sanfte Zooms auf Höhepunkte (scale mit eval=frame + crop – kein zoompan) und Untertitel (ASS) einbrennen.
 * Alle Zeiten von Zooms und Untertiteln sind Zeiten im geschnittenen Video.
 */

/** Originalzeit → Zeit im geschnittenen Video (null = liegt in einer entfernten Stelle). */
export function zeitAbbildung(behalten: Bereich[]): { imSchnitt: (t: number) => number | null; laenge: number } {
  const vorher: number[] = []
  let summe = 0
  for (const b of behalten) {
    vorher.push(summe)
    summe += b.ende - b.start
  }
  return {
    laenge: summe,
    imSchnitt: (t) => {
      for (let i = 0; i < behalten.length; i++) {
        const b = behalten[i]!
        if (t >= b.start && t <= b.ende) return vorher[i]! + (t - b.start)
      }
      return null
    }
  }
}

export interface UntertitelStil {
  breite: number
  hoehe: number
  /** Wort für Wort gelb hervorheben (Karaoke, vor allem für Shorts) */
  karaoke: boolean
  /** höchstens so viele Wörter pro Einblendung */
  woerter: number
  /** Abstand der Untertitel vom unteren Rand (Anteil der Höhe); Shorts: höher, über dem Gameplay */
  unten?: number
  /** Schriftname der Marke (installierte Schrift); Standard Arial */
  schrift?: string | null
}

const ass = (s: number): string => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sek = s % 60
  return `${h}:${String(m).padStart(2, '0')}:${sek.toFixed(2).padStart(5, '0')}`
}
export const sauber = (t: string): string => t.replace(/[{}\\]/g, '').replace(/\s+/g, ' ').trim()

export interface UntertitelWort {
  wort: string
  /** Zeiten im geschnittenen Video */
  a: number
  b: number | null
}

/** Behaltene Wörter zu kurzen, gut lesbaren Einblendungen gruppiert (für ASS zum Einbrennen und SRT für Premiere). */
export function untertitelGruppen(abschnitte: Abschnitt[], liste: Schnittliste, maxWoerter: number, endzeit: (t: number) => number = (t) => t): { woerter: UntertitelWort[]; start: number; ende: number }[] {
  const abb = zeitAbbildung(liste.behalten)
  // Schnittzeit, bei Effekten (Zeitlupe, Standbild) weiter auf die Endzeit umgerechnet
  const imSchnitt = (t: number): number | null => {
    const s = abb.imSchnitt(t)
    return s === null ? null : endzeit(s)
  }
  const woerter = abschnitte
    .flatMap((a) => a.woerter)
    .map((w) => ({ wort: w.wort, a: imSchnitt((w.start + w.ende) / 2) === null ? null : imSchnitt(w.start) ?? imSchnitt((w.start + w.ende) / 2)!, b: imSchnitt(w.ende) }))
    .filter((w): w is UntertitelWort => w.a !== null && sauber(w.wort) !== '')
  const gruppen: UntertitelWort[][] = []
  let g: UntertitelWort[] = []
  for (const w of woerter) {
    const letzter = g[g.length - 1]
    if (letzter && (g.length >= maxWoerter || w.a - (letzter.b ?? letzter.a) > 0.6 || /[.!?…]$/.test(letzter.wort))) {
      gruppen.push(g)
      g = []
    }
    g.push(w)
  }
  if (g.length) gruppen.push(g)
  return gruppen.map((gr, i) => {
    const start = gr[0]!.a
    const naechster = gruppen[i + 1]?.[0]?.a
    const ende = Math.min((gr[gr.length - 1]!.b ?? gr[gr.length - 1]!.a) + 0.25, naechster ?? Infinity)
    return { woerter: gr, start, ende: Math.max(ende, start + 0.3) }
  })
}

/** Untertitel aus den Wortzeiten, nur für behaltene Wörter, kurze gut lesbare Einblendungen. */
export function untertitelAss(abschnitte: Abschnitt[], liste: Schnittliste, stil: UntertitelStil, endzeit?: (t: number) => number): string {
  const gruppen = untertitelGruppen(abschnitte, liste, stil.woerter, endzeit)
  const groesse = Math.round(stil.hoehe * 0.058)
  const kopf = `[Script Info]
ScriptType: v4.00+
PlayResX: ${stil.breite}
PlayResY: ${stil.hoehe}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: CS,${stil.schrift || 'Arial'},${groesse},${stil.karaoke ? '&H0000D7FF' : '&H00FFFFFF'},&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,${Math.max(2, Math.round(groesse / 11))},0,2,${Math.round(stil.breite * 0.08)},${Math.round(stil.breite * 0.08)},${Math.round(stil.hoehe * (stil.unten ?? 0.07))},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`
  const zeilen = gruppen.map(({ woerter: gr, start, ende }) => {
    const text = stil.karaoke
      ? gr.map((w, j) => `{\\k${Math.max(1, Math.round((((gr[j + 1]?.a ?? w.b ?? w.a + 0.3) as number) - w.a) * 100))}}${sauber(w.wort)}`).join(' ')
      : gr.map((w) => sauber(w.wort)).join(' ')
    return `Dialogue: 0,${ass(start)},${ass(ende)},CS,,0,0,0,,${text}`
  })
  return kopf + zeilen.join('\n') + '\n'
}

/** Ausrufe in den häufigsten Sprachen – Höhepunkte für Zooms */
const AUSRUF = /\b(oh nein|nein+|krass|alter|was\?!|boah|wow|oh mein gott|hilfe|schnell|lauf|oh no|no way|omg|oh my god|let'?s go|holy|insane|dios mío|madre mía|incroyable)\b|!/i

/**
 * Höhepunkte für sanfte Zooms: Ausrufe („Oh nein!“) zuerst, dann laute Spitzen; höchstens alle 20 s, Zeiten im
 * geschnittenen Video. Lautstärke allein verliert gegen einen Ausruf in der Nähe.
 */
export function zoomsAus(abschnitte: Abschnitt[], liste: Schnittliste, wellen: { aufloesung: number; werte: number[] } | null, abstand = 20): Bereich[] {
  const { imSchnitt } = zeitAbbildung(liste.behalten)
  const mittel = wellen && wellen.werte.length ? wellen.werte.reduce((x, y) => x + y, 0) / wellen.werte.length : 0
  const spitze = (x: number, y: number): number => {
    if (!wellen) return 0
    const teil = wellen.werte.slice(Math.floor(x / wellen.aufloesung), Math.ceil(y / wellen.aufloesung))
    return teil.length ? Math.max(...teil) : 0
  }
  const kandidaten: (Bereich & { wert: number })[] = []
  for (const ab of abschnitte) {
    const wert = (AUSRUF.test(ab.text) ? 2 : 0) + (mittel > 0 && spitze(ab.start, ab.ende) > Math.min(95, mittel * 2.2) ? 1 : 0)
    if (!wert) continue
    const st = imSchnitt(ab.start)
    const en = imSchnitt(ab.ende)
    if (st === null || en === null || en - st < 0.6) continue
    kandidaten.push({ start: st, ende: Math.min(en + 0.3, st + 6), wert })
  }
  const zooms: Bereich[] = []
  for (const k of kandidaten.sort((x, y) => y.wert - x.wert || x.start - y.start)) {
    if (zooms.some((z) => Math.abs(z.start - k.start) < abstand)) continue
    zooms.push({ start: k.start, ende: k.ende })
  }
  return zooms.sort((x, y) => x.start - y.start)
}

/** Zusätzliche Spur im Render (ROADMAP 5.6): Datei und Versatz gegenüber der Hauptspur in Sekunden */
export interface RenderSpur {
  datei: string
  versatz: number
}

export interface RenderOptionen {
  quelle: string
  liste: Schnittliste
  zooms: Bereich[]
  /** Stärke der automatischen Zooms aus dem Stil (Standard 1.12) */
  zoomFaktor?: number
  /** Dateiname der Untertitel im Arbeitsordner (FFmpeg läuft dort, damit Windows-Pfade im Filter kein Problem sind) */
  untertitel: string | null
  breite: number
  hoehe: number
  fps: number
  audio: boolean
  /**
   * Hochformat (Shorts, Reels, TikTok): mit Facecam-Bereich im Original (Anteile x0,y0,x1,y1) oben die Facecam und
   * darunter das Spiel; sonst ein Ausschnitt, der der Verfolgung folgt (Punkte in Originalzeit, x = Mitte 0–1).
   */
  hoch?: { cam: [number, number, number, number] | null; verfolgung?: { t: number; x: number }[] }
  /** Weitere Spuren: eigene Facecam-Datei und/oder getrennter Ton (ROADMAP 5.6) */
  spuren?: { facecam?: RenderSpur; ton?: RenderSpur }
  /** Video-Encoder-Argumente (z. B. libx264 -preset … oder h264_nvenc …) */
  encoder: string[]
  ausgabe: string
  /** Effekte mit fertigen Text-Bildern und Geräuschen; Zeiten im geschnittenen Video */
  effekte?: { liste: Effekt[]; textBilder: Record<string, { datei: string; breite: number; hoehe: number }>; klaenge: Record<string, string> }
  /** Mit Effekten: Schnittzeit → Endzeit und Länge des fertigen Videos */
  endzeit?: (t: number) => number
  laengeEnde?: number
}

/** Eingaben vor den Effekt-Eingaben: 0 = Hauptvideo, dann Facecam, dann Ton */
function spurIndex(o: RenderOptionen): { facecam: number | null; ton: number | null; anzahl: number } {
  let n = 1
  const facecam = o.spuren?.facecam ? n++ : null
  const ton = o.spuren?.ton ? n++ : null
  return { facecam, ton, anzahl: n }
}

/** Effektteil des Graphen: gleiche Eingaben für filterGraph und renderArgs */
function effektTeil(o: RenderOptionen): EffektGraph | null {
  if (!o.effekte?.liste.length) return null
  const laenge = o.liste.behalten.reduce((s, b) => s + b.ende - b.start, 0)
  return effektGraph({ effekte: o.effekte.liste, laenge, breite: o.breite, hoehe: o.hoehe, fps: o.fps, audio: o.audio, autoZooms: o.hoch ? [] : o.zooms, textBilder: o.effekte.textBilder, klaenge: o.effekte.klaenge, untertitel: o.untertitel, basisEingaben: spurIndex(o).anzahl })
}

const zahl = (x: number): string => x.toFixed(3)

/**
 * Verfolgung als FFmpeg-Ausdruck über die Schnittzeit t: stückweise linear zwischen den Punkten (höchstens 150, sonst
 * wird der Ausdruck zu lang). Punkte in entfernten Stellen fallen weg.
 */
export function verfolgungsAusdruck(punkte: { t: number; x: number }[], behalten: Bereich[], max = 150): string {
  const { imSchnitt } = zeitAbbildung(behalten)
  let p = punkte.map((q) => ({ t: imSchnitt(q.t), x: Math.min(1, Math.max(0, q.x)) })).filter((q): q is { t: number; x: number } => q.t !== null)
  if (!p.length) return '0.5'
  if (p.length > max) {
    const schritt = p.length / max
    p = Array.from({ length: max }, (_, i) => p[Math.floor(i * schritt)]!)
  }
  if (p.length === 1) return zahl(p[0]!.x)
  const teile: string[] = [`${zahl(p[0]!.x)}*lt(t\\,${zahl(p[0]!.t)})`]
  for (let i = 0; i + 1 < p.length; i++) {
    const a = p[i]!
    const b = p[i + 1]!
    const d = Math.max(0.001, b.t - a.t)
    teile.push(`(${zahl(a.x)}+${zahl(b.x - a.x)}*(t-${zahl(a.t)})/${zahl(d)})*gte(t\\,${zahl(a.t)})*lt(t\\,${zahl(b.t)})`)
  }
  teile.push(`${zahl(p[p.length - 1]!.x)}*gte(t\\,${zahl(p[p.length - 1]!.t)})`)
  return teile.join('+')
}

/**
 * Auswahl der behaltenen Stücke als FFmpeg-Ausdruck. Als ausgeglichener Baum (if(lt(t,Mitte),links,rechts)) statt einer
 * langen Summe: Mit 180 Stücken (30-Minuten-Aufnahme) brach FFmpegs Ausdrucks-Leser ab und meldete irreführend
 * „Cannot allocate memory“ (aus MoinStudio v0.48.2). Der Baum ist auch bei tausend Stücken nur ~10 Ebenen tief.
 */
export function auswahlAusdruck(stuecke: readonly { start: number; ende: number }[]): string {
  const s = [...stuecke].sort((a, b) => a.start - b.start)
  const baum = (von: number, bis: number): string => {
    if (bis - von === 1) return `between(t\\,${zahl(s[von]!.start)}\\,${zahl(s[von]!.ende)})`
    const mitte = Math.floor((von + bis) / 2)
    return `if(lt(t\\,${zahl(s[mitte]!.start)})\\,${baum(von, mitte)}\\,${baum(mitte, bis)})`
  }
  return s.length ? baum(0, s.length) : '0'
}

/** Filtergraph (kommt in eine Datei – bei Stunden-Streams wäre er für die Windows-Befehlszeile zu lang). */
export function filterGraph(o: RenderOptionen): string {
  const auswahl = auswahlAusdruck(o.liste.behalten)
  const idx = spurIndex(o)
  const teile: string[] = []
  const basis = `select='${auswahl}',setpts=N/FRAME_RATE/TB,fps=${o.fps}`
  // Facecam-Spur: gleiche Auswahl in derselben (verschobenen) Zeit
  if (idx.facecam !== null) teile.push(`[${idx.facecam}:v]${basis},format=yuv420p[fc]`)
  let video: string
  if (o.hoch?.cam || (o.hoch && idx.facecam !== null)) {
    // Hochformat mit Facecam: oben ein Drittel Facecam (aus eigener Spur oder aus dem Bild ausgeschnitten), darunter das Spiel
    const camH = Math.round(o.hoehe / 3 / 2) * 2
    const cam =
      idx.facecam !== null
        ? `[fc]scale=${o.breite}:${camH}:force_original_aspect_ratio=increase,crop=${o.breite}:${camH}[cam]`
        : (() => {
            const [x0, y0, x1, y1] = o.hoch!.cam!
            return `[c]crop=iw*${zahl(x1 - x0)}:ih*${zahl(y1 - y0)}:iw*${zahl(x0)}:ih*${zahl(y0)},scale=${o.breite}:${camH}:force_original_aspect_ratio=increase,crop=${o.breite}:${camH}[cam]`
          })()
    const quelle = idx.facecam !== null ? `[0:v]${basis}[g]` : `[0:v]${basis},split=2[g][c]`
    video = `${quelle};${cam};[g]scale=-2:${o.hoehe - camH},crop=${o.breite}:${o.hoehe - camH}[spiel];[cam][spiel]vstack,setsar=1[vc]`
  } else if (o.hoch) {
    // Hochformat ohne Facecam: Ausschnitt folgt Gesicht oder Aktion (ROADMAP 5.5)
    const x = o.hoch.verfolgung?.length ? verfolgungsAusdruck(o.hoch.verfolgung, o.liste.behalten) : '0.5'
    video = `[0:v]${basis},scale=${o.breite}:${o.hoehe}:force_original_aspect_ratio=increase,crop=${o.breite}:${o.hoehe}:x='clip((${x})*in_w-out_w/2\\,0\\,in_w-out_w)':y=0,setsar=1[vc]`
  } else {
    video = `[0:v]${basis},scale=${o.breite}:${o.hoehe}:force_original_aspect_ratio=increase,crop=${o.breite}:${o.hoehe},setsar=1[vb]`
    // Querformat mit eigener Facecam-Spur: Bild im Bild unten rechts (28 % der Breite)
    if (idx.facecam !== null) {
      const fw = Math.round((o.breite * 0.28) / 2) * 2
      video += `;[fc]scale=${fw}:-2[fcs];[vb][fcs]overlay=x=W-w-W*0.03:y=H-h-H*0.04:shortest=1[vc]`
    } else video += `;[vb]null[vc]`
  }
  teile.push(video)
  // Ton: Hauptspur oder getrennte Tonspur, gleiche Auswahl
  const tonQuelle = idx.ton !== null ? idx.ton : 0
  const ton = o.audio ? `[${tonQuelle}:a]aselect='${auswahl}',asetpts=N/SR/TB` : null
  const eff = effektTeil(o)
  if (eff) {
    if (ton) teile.push(`${ton}[ac]`)
    teile.push(eff.graph)
    return teile.join(';\n')
  }
  const zoom =
    o.zooms.length && !o.hoch
      ? `scale=w='iw*(1+${zahl(o.zoomFaktor ? o.zoomFaktor - 1 : 0.12)}*(${o.zooms.map((z) => `min(1\\,max(0\\,(t-${zahl(z.start)})/0.35))*min(1\\,max(0\\,(${zahl(z.ende)}-t)/0.35))`).join('+')}))':h=-2:eval=frame,crop=${o.breite}:${o.hoehe},`
      : ''
  teile.push(`[vc]${zoom}${o.untertitel ? `subtitles=${o.untertitel},` : ''}format=yuv420p[v]`)
  if (ton) teile.push(`${ton}[a]`)
  return teile.join(';\n')
}

/** Eingabe-Argumente einer Spur mit Versatz: später beginnende Spuren werden verzögert, frühere angeschnitten */
function spurEingabe(s: RenderSpur): string[] {
  return s.versatz >= 0 ? ['-itsoffset', zahl(s.versatz), '-i', s.datei] : ['-ss', zahl(-s.versatz), '-i', s.datei]
}

export function renderArgs(o: RenderOptionen, graphDatei: string): string[] {
  const spuren = [...(o.spuren?.facecam ? spurEingabe(o.spuren.facecam) : []), ...(o.spuren?.ton ? spurEingabe(o.spuren.ton) : [])]
  const eingaben = (effektTeil(o)?.eingaben ?? []).flatMap((e) => [...e.vor, '-i', e.datei])
  return ['-i', o.quelle, ...spuren, ...eingaben, '-/filter_complex', graphDatei, '-map', '[v]', ...(o.audio ? ['-map', '[a]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000'] : []), ...o.encoder, '-movflags', '+faststart', o.ausgabe]
}
