// Herkunft: MoinStudio src/main/schnitt/effekte.ts (MIT).
import type { Bereich } from './rohschnitt'
import type { Chroma } from './bibliothek'
import { alphaDecoder, chromaFilter } from './chroma'

/** Lage im Bild; Ecken für Effekte aus der Bibliothek (Abo-Animation unten rechts …), „voll“ = ganzes Bild */
export type EffektLage = 'oben' | 'mitte' | 'unten' | 'links' | 'rechts' | 'oben-links' | 'oben-rechts' | 'unten-links' | 'unten-rechts' | 'voll'
/** Effekt stammt aus der Bibliothek (Name für die Zeitleiste, automatisch oder per Wunsch gesetzt) */
export interface BibMarke {
  id: string
  name: string
  auto?: boolean
}

/** x/y-Ausdruck für overlay aus der Lage (4–6 % Randabstand, unten über der Player-Leiste) – aus MoinStudio v0.50.0 */
export function lageXY(lage: EffektLage | undefined, std: EffektLage): { x: string; y: string } {
  const l = lage ?? std
  if (l === 'voll') return { x: '0', y: '0' }
  const x = l.endsWith('links') ? 'W*0.04' : l.endsWith('rechts') ? 'W*0.96-w' : '(W-w)/2'
  const y = l.startsWith('oben') ? 'H*0.06' : l.startsWith('unten') ? 'H*0.86-h' : '(H-h)/2'
  return { x, y }
}

/**
 * Effekte im Schnitt (ROADMAP 5.4): kombinierbare Bausteine statt fester Effektliste. Zeiten stehen im geschnittenen
 * Video („Schnittzeit“). Tempo und Einfrieren verändern die Zeitleiste; alles andere (Zoom, Wackeln, Farbe, Blitz,
 * Übergang, Text, Bild, Geräusch, Zensur) läuft danach auf der „Endzeit“ – dafür gibt es die Zeitabbildung.
 */

export type Effekt =
  | { art: 'tempo'; von: number; bis: number; faktor: number }
  | { art: 'einfrieren'; bei: number; dauer: number }
  | { art: 'zoom'; von: number; bis: number; faktor: number; x?: number; y?: number }
  | { art: 'wackeln'; von: number; bis: number; staerke?: number }
  | { art: 'farbe'; von: number; bis: number; saettigung?: number; kontrast?: number; helligkeit?: number; schwarzweiss?: boolean; ton?: 'warm' | 'kalt' | 'rot' | 'gruen' | 'blau' }
  | { art: 'blitz'; bei: number; dauer?: number; farbe?: 'weiss' | 'schwarz' }
  | { art: 'uebergang'; bei: number; dauer?: number; farbe?: 'weiss' | 'schwarz' }
  /** Ausblenden (bleibt dunkel, z. B. am Ende) oder Einblenden (aus Schwarz, z. B. am Anfang); Ton geht mit */
  | { art: 'abblende'; von: number; bis: number; richtung: 'aus' | 'ein'; farbe?: 'weiss' | 'schwarz' }
  | { art: 'text'; von: number; bis: number; text: string; lage?: 'oben' | 'mitte' | 'unten'; farbe?: string; groesse?: number; animation?: 'pop' | 'fest' }
  | { art: 'bild'; von: number; bis: number; datei: string; lage?: EffektLage; groesse?: number; bib?: BibMarke }
  /** Video mit Alphakanal oder Greenscreen einblenden (Abo-Animation, Grafikpaket): läuft ab `bei` einmal durch, `ton` mischt seinen Ton dazu */
  | { art: 'video'; bei: number; datei: string; lage?: EffektLage; groesse?: number; ton?: boolean; chroma?: Chroma; bib?: BibMarke }
  | { art: 'geraeusch'; bei: number; klang: string; lautstaerke?: number; bib?: BibMarke }
  | { art: 'zensur'; von: number; bis: number }
  | { art: 'lautstaerke'; von: number; bis: number; faktor: number }
  /** Vorspann (ROADMAP 5.4): Clips und Titelkarten vor dem Video; klang: false schaltet die automatischen Geräusche ab */
  | { art: 'intro'; teile: IntroTeil[]; klang?: boolean }

/** Teil eines Intros: kurzer Moment aus dem Video (Schnittzeit), Titelkarte in der Schrift der Marke oder Skin-Sting
 *  (aus MoinStudio v0.45.0: die Minecraft-Figur des Creators animiert aus Blender, dazu der Kanalname) */
export type IntroTeil =
  | { art: 'clip'; von: number; bis: number; tempo?: number }
  | { art: 'karte'; text: string; dauer?: number; farbe?: string; hintergrund?: 'unscharf' | 'schwarz' | 'bild'; bei?: number; bild?: string; klang?: string }
  | { art: 'sting'; vorlage?: StingVorlage; text?: string; farbe?: string; dauer?: number; hintergrund?: 'unscharf' | 'schwarz' | 'bild'; bei?: number; bild?: string; klang?: string }

export const STING_VORLAGEN = ['sprung', 'winken', 'schwert'] as const
export type StingVorlage = (typeof STING_VORLAGEN)[number]

export const EFFEKT_ARTEN = ['tempo', 'einfrieren', 'zoom', 'wackeln', 'farbe', 'blitz', 'uebergang', 'text', 'bild', 'video', 'geraeusch', 'zensur', 'lautstaerke', 'intro', 'abblende'] as const

/** Stück der neuen Zeitleiste: normal (ggf. mit Tempo) oder ein eingefrorenes Standbild */
export type Stueck = { a: number; b: number; faktor: number } | { frieren: number; dauer: number }

export interface Zeitleiste {
  stuecke: Stueck[]
  /** Schnittzeit → Endzeit */
  endzeit: (t: number) => number
  laenge: number
  /** true, wenn Tempo oder Einfrieren die Zeitleiste verändern */
  veraendert: boolean
}

const klemme = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x))

/** Zeitleiste aus Tempo- und Einfrier-Effekten. Überlappende Tempo-Bereiche: der später genannte gewinnt. */
export function zeitleiste(effekte: Effekt[], laenge: number): Zeitleiste {
  const tempo = effekte.filter((e): e is Extract<Effekt, { art: 'tempo' }> => e.art === 'tempo' && e.bis > e.von && e.faktor > 0)
  const frieren = effekte
    .filter((e): e is Extract<Effekt, { art: 'einfrieren' }> => e.art === 'einfrieren' && e.dauer > 0)
    .map((e) => ({ bei: klemme(e.bei, 0, laenge), dauer: e.dauer }))
    .sort((x, y) => x.bei - y.bei)
  const punkte = [...new Set([0, laenge, ...tempo.flatMap((e) => [klemme(e.von, 0, laenge), klemme(e.bis, 0, laenge)]), ...frieren.map((f) => f.bei)])].sort((x, y) => x - y)
  const faktorBei = (t: number): number => {
    let f = 1
    for (const e of tempo) if (t >= e.von && t < e.bis) f = klemme(e.faktor, 0.1, 8)
    return f
  }
  const stuecke: Stueck[] = []
  for (let i = 0; i < punkte.length - 1; i++) {
    const a = punkte[i]!
    const b = punkte[i + 1]!
    for (const f of frieren) if (f.bei === a) stuecke.push({ frieren: a, dauer: f.dauer })
    if (b - a > 1e-6) stuecke.push({ a, b, faktor: faktorBei((a + b) / 2) })
  }
  for (const f of frieren) if (f.bei >= laenge) stuecke.push({ frieren: laenge, dauer: f.dauer })
  const endzeit = (t: number): number => {
    let s = 0
    for (const st of stuecke) {
      if ('frieren' in st) {
        if (st.frieren < t) s += st.dauer // ein Ereignis genau am Standbild beginnt mit dem Standbild
        continue
      }
      if (t <= st.a) break
      s += (Math.min(t, st.b) - st.a) / st.faktor
      if (t <= st.b) break
    }
    return s
  }
  const neu = stuecke.reduce((s, st) => s + ('frieren' in st ? st.dauer : (st.b - st.a) / st.faktor), 0)
  return { stuecke, endzeit, laenge: neu, veraendert: tempo.length > 0 || frieren.length > 0 }
}

const z = (x: number): string => x.toFixed(3)
const zwischen = (a: number, b: number): string => `between(t\\,${z(a)}\\,${z(b)})`
/** 0 → 1 → 0 mit weicher Rampe: Gewicht eines Bereichs zur Zeit t */
const rampe = (a: number, b: number, r = 0.3): string => `min(1\\,max(0\\,(t-${z(a)})/${z(r)}))*min(1\\,max(0\\,(${z(b)}-t)/${z(r)}))`

/** atempo kann je Stufe nur 0,5–2: größere Faktoren als Kette */
export function atempoKette(f: number): string {
  const teile: string[] = []
  let rest = f
  while (rest < 0.5) {
    teile.push('atempo=0.5')
    rest /= 0.5
  }
  while (rest > 2) {
    teile.push('atempo=2')
    rest /= 2
  }
  if (Math.abs(rest - 1) > 1e-3) teile.push(`atempo=${Number(rest.toFixed(4))}`)
  return teile.join(',') || 'anull'
}

export interface EffektEingabe {
  /** Argumente für ffmpeg vor diesem -i (z. B. -loop 1 -t 3) */
  vor: string[]
  datei: string
}

export interface EffektGraph {
  /** Filter ab [vc]/[ac] bis [v]/[a] */
  graph: string
  /** zusätzliche Eingaben ab Index 1 */
  eingaben: EffektEingabe[]
  /** Länge des fertigen Videos */
  laenge: number
  /** Schnittzeit → Endzeit (für Untertitel und automatische Zooms) */
  endzeit: (t: number) => number
}

export interface EffektOptionen {
  effekte: Effekt[]
  /** Länge des geschnittenen Videos (Schnittzeit) */
  laenge: number
  breite: number
  hoehe: number
  fps: number
  audio: boolean
  /** automatische Zooms (Schnittzeit), wie bisher */
  autoZooms: Bereich[]
  /** fertige Text-Bilder (PNG in der Markenschrift) je Effekt-Index, bei Intro-Karten „Effekt.Teil“ (z. B. „0.2“) */
  textBilder: Record<string, { datei: string; breite: number; hoehe: number }>
  /** Geräusch-Dateien je Klang */
  klaenge: Record<string, string>
  untertitel: string | null
  /** fertig gerenderte Skin-Stings (Video mit Alphakanal) je Intro-Teil „Effekt.Teil“ */
  stingVideos?: Record<string, string>
  /** Zahl der Eingaben vor den Effekt-Eingaben (Hauptvideo und weitere Spuren); Standard 1 */
  basisEingaben?: number
}

/** Dauer eines Intro-Teils in Sekunden */
export function introDauer(t: IntroTeil): number {
  if (t.art === 'clip') return Math.max(0.1, (t.bis - t.von) / klemme(t.tempo ?? 1, 0.25, 4))
  if (t.art === 'sting') return klemme(t.dauer ?? 2.2, 1, 4)
  return klemme(t.dauer ?? 2, 0.5, 6)
}

/** Filtergraph für alle Effekte: Intro, Zeitleiste (Tempo, Einfrieren), dann Bild, Einblendungen, Ton. */
export function effektGraph(o: EffektOptionen): EffektGraph {
  const zl = zeitleiste(o.effekte, o.laenge)
  const introIndex = o.effekte.findIndex((e) => e.art === 'intro')
  const intro = introIndex >= 0 ? (o.effekte[introIndex] as Extract<Effekt, { art: 'intro' }>) : null
  const introTeile = intro?.teile ?? []
  const introLaenge = introTeile.reduce((s, t) => s + introDauer(t), 0)
  // Endzeit: erst das Intro, dann das Video mit seiner (ggf. veränderten) Zeitleiste
  const E = (t: number): number => introLaenge + zl.endzeit(t)
  const teile: string[] = []
  const eingaben: EffektEingabe[] = []
  const neueEingabe = (e: EffektEingabe): number => eingaben.push(e) + (o.basisEingaben ?? 1) - 1
  const format = `format=yuv420p,setsar=1`
  let v = 'vc'
  let a = 'ac'
  // Ton einheitlich (48 kHz Stereo), sobald Stücke zusammengesetzt werden
  if (o.audio && (zl.veraendert || introTeile.length)) {
    teile.push(`[ac]aresample=48000,aformat=channel_layouts=stereo[acn]`)
    a = 'acn'
  }
  // Das Intro braucht eine eigene Kopie des geschnittenen Videos
  if (introTeile.length) {
    teile.push(`[vc]split=2[vc0][vi]`)
    v = 'vc0'
    if (o.audio) {
      teile.push(`[${a}]asplit=2[ac0][ai]`)
      a = 'ac0'
    }
  }
  // 1. Zeitleiste: Stücke zerlegen, Tempo/Standbild anwenden, wieder zusammensetzen
  if (zl.veraendert) {
    const n = zl.stuecke.length
    teile.push(`[${v}]split=${n}${zl.stuecke.map((_, i) => `[vs${i}]`).join('')}`)
    if (o.audio) teile.push(`[${a}]asplit=${n}${zl.stuecke.map((_, i) => `[as${i}]`).join('')}`)
    zl.stuecke.forEach((st, i) => {
      if ('frieren' in st) {
        const p = Math.max(0, st.frieren - 1 / o.fps)
        teile.push(`[vs${i}]trim=start=${z(p)}:end=${z(p + 1 / o.fps)},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${z(st.dauer)},trim=duration=${z(st.dauer)}[vt${i}]`)
        if (o.audio) teile.push(`[as${i}]atrim=start=0:end=0.001,asetpts=PTS-STARTPTS,apad=whole_dur=${z(st.dauer)},volume=0[at${i}]`)
      } else {
        teile.push(`[vs${i}]trim=start=${z(st.a)}:end=${z(st.b)},setpts=(PTS-STARTPTS)/${st.faktor}[vt${i}]`)
        if (o.audio) teile.push(`[as${i}]atrim=start=${z(st.a)}:end=${z(st.b)},asetpts=PTS-STARTPTS,${atempoKette(st.faktor)}[at${i}]`)
      }
    })
    teile.push(`${zl.stuecke.map((_, i) => `[vt${i}]${o.audio ? `[at${i}]` : ''}`).join('')}concat=n=${n}:v=1:a=${o.audio ? 1 : 0}[vz]${o.audio ? '[az]' : ''}`)
    v = 'vz'
    a = o.audio ? 'az' : a
  }
  // Geräusche (Zeit im fertigen Video): aus Effekten und automatisch aus dem Intro
  const klangEreignisse: { zeit: number; klang: string; lautstaerke: number }[] = []
  // 2. Intro: Clips und Titelkarten vor das Video setzen
  if (introTeile.length) {
    const aufVideo = introTeile.filter((t) => t.art === 'clip' || (t.hintergrund ?? 'unscharf') === 'unscharf').length
    const clips = introTeile.filter((t) => t.art === 'clip').length
    if (aufVideo) teile.push(`[vi]split=${aufVideo}${Array.from({ length: aufVideo }, (_, i) => `[vi${i}]`).join('')}`)
    else teile.push(`[vi]nullsink`)
    if (o.audio) {
      if (clips) teile.push(`[ai]asplit=${clips}${Array.from({ length: clips }, (_, i) => `[ai${i}]`).join('')}`)
      else teile.push(`[ai]anullsink`)
    }
    let vk = 0
    let ak = 0
    let zeit = 0
    introTeile.forEach((t, j) => {
      const d = introDauer(t)
      if (t.art === 'clip') {
        const tempo = klemme(t.tempo ?? 1, 0.25, 4)
        teile.push(`[vi${vk++}]trim=start=${z(t.von)}:end=${z(t.bis)},setpts=(PTS-STARTPTS)/${tempo},${format}[ip${j}v]`)
        if (o.audio) teile.push(`[ai${ak++}]atrim=start=${z(t.von)}:end=${z(t.bis)},asetpts=PTS-STARTPTS,${atempoKette(tempo)}[ip${j}a]`)
        if (j > 0 && intro?.klang !== false) klangEreignisse.push({ zeit, klang: 'whoosh', lautstaerke: 0.7 })
      } else {
        const hg = t.hintergrund ?? 'unscharf'
        if (hg === 'unscharf') {
          const b = klemme(t.bei ?? o.laenge / 2, 0, Math.max(0, o.laenge - 0.1))
          teile.push(`[vi${vk++}]trim=start=${z(b)}:end=${z(b + 1 / o.fps)},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${z(d)},trim=duration=${z(d)},boxblur=18:2,eq=brightness=-0.22,${format}[kb${j}]`)
        } else if (hg === 'bild' && t.bild) {
          const idx = neueEingabe({ vor: ['-loop', '1', '-framerate', String(o.fps), '-t', z(d)], datei: t.bild })
          teile.push(`[${idx}:v]scale=${o.breite}:${o.hoehe}:force_original_aspect_ratio=increase,crop=${o.breite}:${o.hoehe},eq=brightness=-0.12,${format}[kb${j}]`)
        } else {
          teile.push(`color=c=0x101014:s=${o.breite}x${o.hoehe}:r=${o.fps}:d=${z(d)},${format}[kb${j}]`)
        }
        const sting = t.art === 'sting' ? o.stingVideos?.[`${introIndex}.${j}`] : undefined
        if (sting) {
          // Skin-Sting mit Alphakanal über den Hintergrund; danach kommt der Kanalname im unteren Drittel dazu
          const idx = neueEingabe({ vor: [], datei: sting })
          teile.push(`[${idx}:v]format=rgba,scale=${o.breite}:${o.hoehe},fps=${o.fps},tpad=stop_mode=clone:stop_duration=${z(d)},trim=duration=${z(d)},setpts=PTS-STARTPTS[st${j}]`)
          teile.push(`[kb${j}][st${j}]overlay=0:0:shortest=1,${format}[kb${j}s]`)
        }
        const hgName = sting ? `kb${j}s` : `kb${j}`
        const tb = o.textBilder[`${introIndex}.${j}`]
        if (tb && t.art === 'sting') {
          // Kanalname ab 40 % der Dauer mit Pop im unteren Drittel
          const idx = neueEingabe({ vor: ['-loop', '1', '-framerate', String(o.fps), '-t', z(d)], datei: tb.datei })
          const breite = Math.min(Math.round(o.breite * 0.7), Math.round(o.hoehe * 0.12 * (tb.breite / Math.max(1, tb.hoehe))))
          const ab = z(d * 0.4)
          teile.push(`[${idx}:v]format=rgba,scale=w='${breite}*(0.5+0.5*min(1\\,max(0\\,t-${ab})/0.18))':h=-1:eval=frame[kt${j}]`)
          teile.push(`[${hgName}][kt${j}]overlay=x='(W-w)/2':y='H*0.8-h/2':enable='gte(t\\,${ab})':shortest=1,${format}[ip${j}v]`)
        } else if (tb) {
          const idx = neueEingabe({ vor: ['-loop', '1', '-framerate', String(o.fps), '-t', z(d)], datei: tb.datei })
          const zeilen = Math.max(1, (t.text ?? '').split('\n').length)
          const breite = Math.min(Math.round(o.breite * 0.9), Math.round(o.hoehe * 0.16 * (tb.breite / Math.max(1, tb.hoehe / zeilen))))
          teile.push(`[${idx}:v]format=rgba,scale=w='${breite}*(0.5+0.5*min(1\\,t/0.18))':h=-1:eval=frame[kt${j}]`)
          teile.push(`[kb${j}][kt${j}]overlay=x='(W-w)/2':y='(H-h)/2':shortest=1,${format}[ip${j}v]`)
        } else {
          teile.push(`[${hgName}]null[ip${j}v]`)
        }
        if (o.audio) teile.push(`aevalsrc=0|0:d=${z(d)}:s=48000[ip${j}a]`)
        if (intro?.klang !== false && t.art === 'sting') {
          // Sting: Wusch beim Sprung, Knall bei der Landung, Ding zum Kanalnamen
          klangEreignisse.push({ zeit, klang: 'whoosh', lautstaerke: 0.8 }, { zeit: zeit + d * 0.35, klang: t.klang ?? 'boom', lautstaerke: 0.9 }, { zeit: zeit + d * 0.4, klang: 'ding', lautstaerke: 0.6 })
        } else if (intro?.klang !== false) klangEreignisse.push({ zeit, klang: t.klang ?? 'boom', lautstaerke: 0.9 })
      }
      zeit += d
    })
    teile.push(`[${v}]${format}[vm]`)
    const n = introTeile.length + 1
    teile.push(`${introTeile.map((_, j) => `[ip${j}v]${o.audio ? `[ip${j}a]` : ''}`).join('')}[vm]${o.audio ? `[${a}]` : ''}concat=n=${n}:v=1:a=${o.audio ? 1 : 0}[vin]${o.audio ? '[ain]' : ''}`)
    v = 'vin'
    a = o.audio ? 'ain' : a
  }
  const kette: string[] = []
  // 3. Zoom und Wackeln: ein scale+crop mit Ausdrücken über die Endzeit
  const zooms = [
    ...o.autoZooms.map((b) => ({ a: E(b.start), b: E(b.ende), f: 1.12, x: 0.5, y: 0.5 })),
    ...o.effekte.filter((e): e is Extract<Effekt, { art: 'zoom' }> => e.art === 'zoom').map((e) => ({ a: E(e.von), b: E(e.bis), f: klemme(e.faktor, 1, 4), x: klemme(e.x ?? 0.5, 0, 1), y: klemme(e.y ?? 0.5, 0, 1) }))
  ]
  const wackeln = o.effekte.filter((e): e is Extract<Effekt, { art: 'wackeln' }> => e.art === 'wackeln').map((e) => ({ a: E(e.von), b: E(e.bis), s: klemme(e.staerke ?? 0.5, 0.1, 1) * o.breite * 0.02 }))
  if (zooms.length || wackeln.length) {
    const gewicht = zooms.map((q) => `(${z(q.f - 1)})*${rampe(q.a, q.b, Math.min(0.35, (q.b - q.a) / 3))}`)
    const rand = wackeln.map((w) => `${z((2 * w.s) / o.breite)}*${zwischen(w.a, w.b)}`)
    const faktor = `1+${[...gewicht, ...rand].join('+')}`
    const summe = zooms.length ? `min(1\\,${zooms.map((q) => rampe(q.a, q.b, Math.min(0.35, (q.b - q.a) / 3))).join('+')})` : '0'
    const lage = (k: 'x' | 'y'): string => (zooms.length ? `(${zooms.map((q) => `${z(q[k] - 0.5)}*${rampe(q.a, q.b, Math.min(0.35, (q.b - q.a) / 3))}`).join('+')})` : '0')
    const zitter = (k: 'x' | 'y'): string => (wackeln.length ? `+${wackeln.map((w, i) => `${z(w.s)}*${k === 'x' ? 'sin' : 'cos'}(t*${47 + i * 7})*${zwischen(w.a, w.b)}`).join('+')}` : '')
    kette.push(`scale=w='iw*(${faktor})':h=-2:eval=frame`)
    kette.push(`crop=${o.breite}:${o.hoehe}:x='clip((in_w-out_w)*(0.5+${lage('x')}/max(0.001\\,${summe}))${zitter('x')}\\,0\\,in_w-out_w)':y='clip((in_h-out_h)*(0.5+${lage('y')}/max(0.001\\,${summe}))${zitter('y')}\\,0\\,in_h-out_h)'`)
  }
  // 4. Farbe: je Bereich eigene Filter mit enable
  for (const e of o.effekte) {
    if (e.art !== 'farbe') continue
    const en = `enable='${zwischen(E(e.von), E(e.bis))}'`
    if (e.saettigung !== undefined || e.kontrast !== undefined || e.helligkeit !== undefined)
      kette.push(`eq=saturation=${z(klemme(e.saettigung ?? 1, 0, 3))}:contrast=${z(klemme(e.kontrast ?? 1, 0.3, 2.5))}:brightness=${z(klemme(e.helligkeit ?? 0, -0.6, 0.6))}:${en}`)
    if (e.schwarzweiss) kette.push(`hue=s=0:${en}`)
    // Ton auf Schatten, Mitteltöne und Lichter (nur Schatten wäre kaum sichtbar)
    const ton3 = (r: number, g: number, b: number): string => ['s', 'm', 'h'].map((k) => `r${k}=${r}:g${k}=${g}:b${k}=${b}`).join(':')
    const toene: Record<string, string> = { warm: ton3(0.12, 0.02, -0.12), kalt: ton3(-0.12, 0, 0.14), rot: ton3(0.3, -0.12, -0.12), gruen: ton3(-0.1, 0.25, -0.1), blau: ton3(-0.1, -0.05, 0.3) }
    const ton = e.ton ? toene[e.ton] : undefined
    if (ton) kette.push(`colorbalance=${ton}:${en}`)
  }
  // 5. Blitz und Übergänge: Helligkeit rauf (weiß) oder runter (schwarz), weich ein und aus
  const hell = o.effekte
    .filter((e): e is Extract<Effekt, { art: 'blitz' | 'uebergang' }> => e.art === 'blitz' || e.art === 'uebergang')
    .map((e) => {
      const d = klemme(e.dauer ?? (e.art === 'blitz' ? 0.25 : 0.6), 0.05, 3)
      const m = E(e.bei)
      const vz = (e.farbe ?? (e.art === 'blitz' ? 'weiss' : 'schwarz')) === 'weiss' ? 1 : -1
      return `${vz}*max(0\\,1-abs(t-${z(m)})/${z(d / 2)})`
    })
  // Ab- und Einblenden: Helligkeit gleitet zu Schwarz/Weiß und bleibt dort (aus) bzw. kommt von dort (ein)
  for (const e of o.effekte) {
    if (e.art !== 'abblende') continue
    const a0 = E(e.von)
    const a1 = Math.max(a0 + 0.1, E(e.bis))
    const anteil = `clip((t-${z(a0)})/${z(a1 - a0)}\\,0\\,1)`
    const vz = (e.farbe ?? 'schwarz') === 'weiss' ? 1 : -1
    hell.push(`${vz}*${e.richtung === 'ein' ? `(1-${anteil})` : anteil}`)
  }
  if (hell.length) kette.push(`eq=brightness='${hell.join('+')}':eval=frame`)
  // 6. Zensur: Unschärfe
  for (const e of o.effekte) if (e.art === 'zensur') kette.push(`boxblur=20:5:enable='${zwischen(E(e.von), E(e.bis))}'`)
  // 7. Untertitel (Zeiten sind beim Schreiben schon auf die Endzeit umgerechnet)
  if (o.untertitel) kette.push(`subtitles=${o.untertitel}`)
  teile.push(`[${v}]${kette.length ? kette.join(',') : 'null'}[vf]`)
  v = 'vf'
  // 8. Text und Bilder als Einblendungen
  o.effekte.forEach((e, i) => {
    if (e.art !== 'text' && e.art !== 'bild') return
    const tb = e.art === 'text' ? o.textBilder[String(i)] : null
    const datei = e.art === 'text' ? tb?.datei : e.datei
    if (!datei) return
    const von = E(e.von)
    const bis = Math.max(von + 0.2, E(e.bis))
    // Nur so lange erzeugen, wie die Einblendung zu sehen ist, und dann an ihre Stelle schieben – sonst lief jedes Bild ab
    // Sekunde 0 mit und FFmpeg ging bei vielen Texten der Speicher aus (aus MoinStudio v0.48.2)
    const idx = neueEingabe({ vor: ['-loop', '1', '-framerate', String(o.fps), '-t', z(bis - von + 0.1)], datei })
    // Größe: Text als Anteil der Bildhöhe je Zeile, Bild als Anteil der Breite
    const breite = e.art === 'text' ? Math.round(o.hoehe * klemme(e.groesse ?? 0.12, 0.07, 0.4) * ((tb?.breite ?? 1) / Math.max(1, (tb?.hoehe ?? 1) / Math.max(1, e.text.split('\n').length)))) : Math.round(o.breite * klemme(e.groesse ?? 0.3, 0.05, 1))
    const pop = e.art === 'text' && (e.animation ?? 'pop') === 'pop' ? `*(0.55+0.45*min(1\\,max(0\\,(t-${z(von)})/0.12)))` : ''
    const lage = e.lage ?? (e.art === 'text' ? 'oben' : 'rechts')
    const ecke = lage.includes('-') || lage === 'voll'
    const x = ecke ? lageXY(lage, 'rechts').x : lage === 'links' ? 'W*0.05' : lage === 'rechts' ? 'W*0.95-w' : '(W-w)/2'
    const y = ecke ? lageXY(lage, 'rechts').y : lage === 'oben' ? 'H*0.08' : lage === 'unten' ? 'H*0.78-h' : '(H-h)/2'
    teile.push(`[${idx}:v]setpts=PTS-STARTPTS+${z(von)}/TB,format=rgba,scale=w='${Math.min(o.breite, breite)}${pop}':h=-1:eval=frame,fade=t=in:st=${z(von)}:d=0.1:alpha=1,fade=t=out:st=${z(bis - 0.15)}:d=0.15:alpha=1[ov${i}]`)
    teile.push(`[${v}][ov${i}]overlay=x='${x}':y='${y}':enable='${zwischen(von, bis)}':eof_action=pass[vo${i}]`)
    v = `vo${i}`
  })
  // Video-Einblendungen (Abo-Animation, aus MoinStudio v0.46.0/v0.50.0): ab „bei“ einmal durchlaufen lassen; volle Größe
  // = ganzes Bild (die Animation bringt ihre Lage selbst mit), kleiner nach „lage“ platziert; Greenscreen per Chroma Key
  const videoTon: { idx: number; zeit: number }[] = []
  o.effekte.forEach((e, i) => {
    if (e.art !== 'video' || !e.datei) return
    const von = E(e.bei)
    const g = e.lage === 'voll' ? 1 : klemme(e.groesse ?? 1, 0.1, 1)
    const idx = neueEingabe({ vor: alphaDecoder(e.datei), datei: e.datei })
    const { x, y } = g >= 1 ? { x: '0', y: '0' } : lageXY(e.lage, 'unten')
    const key = e.chroma ? chromaFilter(e.chroma) : 'format=rgba'
    teile.push(`[${idx}:v]${key},scale=${Math.round(o.breite * g)}:-2,fps=${o.fps},setpts=PTS-STARTPTS+${z(von)}/TB[vv${i}]`)
    teile.push(`[${v}][vv${i}]overlay=x='${x}':y='${y}':eof_action=pass[vvo${i}]`)
    v = `vvo${i}`
    if (e.ton) videoTon.push({ idx, zeit: von })
  })
  teile.push(`[${v}]format=yuv420p[v]`)
  // 9. Ton: Lautstärke, Zensur-Stille, Geräusche dazumischen
  if (o.audio) {
    const lauter = o.effekte
      .filter((e): e is Extract<Effekt, { art: 'lautstaerke' | 'zensur' }> => e.art === 'lautstaerke' || e.art === 'zensur')
      .map((e) => `volume=${e.art === 'zensur' ? 0 : z(klemme(e.faktor, 0, 4))}:enable='${zwischen(E(e.von), E(e.bis))}'`)
    // Ton blendet mit aus bzw. ein
    for (const e of o.effekte) {
      if (e.art !== 'abblende') continue
      const a0 = E(e.von)
      const a1 = Math.max(a0 + 0.1, E(e.bis))
      const anteil = `clip((t-${z(a0)})/${z(a1 - a0)}\\,0\\,1)`
      lauter.push(`volume='${e.richtung === 'ein' ? anteil : `1-${anteil}`}':eval=frame`)
    }
    for (const e of o.effekte) if (e.art === 'geraeusch') klangEreignisse.push({ zeit: E(e.bei), klang: e.klang, lautstaerke: klemme(e.lautstaerke ?? 1, 0, 3) })
    teile.push(`[${a}]${lauter.length ? lauter.join(',') : 'anull'}[al]`)
    const mix: string[] = ['[al]']
    klangEreignisse
      .filter((k) => o.klaenge[k.klang])
      .forEach((k, j) => {
        const idx = neueEingabe({ vor: [], datei: o.klaenge[k.klang]! })
        teile.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(k.zeit * 1000)}:all=1,volume=${z(k.lautstaerke)}[g${j}]`)
        mix.push(`[g${j}]`)
      })
    videoTon.forEach((tv, j) => {
      teile.push(`[${tv.idx}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(tv.zeit * 1000)}:all=1[vt${j}]`)
      mix.push(`[vt${j}]`)
    })
    // Zensur bekommt automatisch ein Piep
    o.effekte
      .filter((e): e is Extract<Effekt, { art: 'zensur' }> => e.art === 'zensur' && !!o.klaenge['piep'])
      .forEach((e, j) => {
        const idx = neueEingabe({ vor: ['-stream_loop', '-1', '-t', z(Math.max(0.1, E(e.bis) - E(e.von)))], datei: o.klaenge['piep']! })
        teile.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(E(e.von) * 1000)}:all=1[p${j}]`)
        mix.push(`[p${j}]`)
      })
    teile.push(mix.length > 1 ? `${mix.join('')}amix=inputs=${mix.length}:normalize=0:duration=first[a]` : '[al]anull[a]')
  }
  return { graph: teile.join(';\n'), eingaben, laenge: introLaenge + zl.laenge, endzeit: E }
}

/**
 * Originalzeit → Schnittzeit. Effekte werden in Originalzeit gespeichert (wie das Transkript), damit sie an ihrer
 * Stelle bleiben, wenn der Creator später Stellen rein- oder rausnimmt. Liegt ein Zeitpunkt in einer entfernten Stelle,
 * rastet er auf den nächsten behaltenen Rand ein: Anfänge nach vorn, Enden nach hinten.
 */
export function zuSchnittzeit(t: number, behalten: Bereich[], richtung: 'anfang' | 'ende'): number | null {
  let vorher = 0
  for (let i = 0; i < behalten.length; i++) {
    const b = behalten[i]!
    if (t >= b.start && t <= b.ende) return vorher + (t - b.start)
    if (t < b.start) {
      // in der Lücke vor diesem Stück
      if (richtung === 'anfang') return vorher
      return i === 0 ? null : vorher
    }
    vorher += b.ende - b.start
  }
  return richtung === 'ende' && behalten.length ? vorher : null
}

/** Effekte von Originalzeit in Schnittzeit umrechnen; Bereiche, die ganz herausgeschnitten sind, fallen weg. */
export function effekteInSchnittzeit(effekte: Effekt[], behalten: Bereich[]): Effekt[] {
  const aus: Effekt[] = []
  for (const e of effekte) {
    if (e.art === 'intro') {
      const teile = e.teile
        .map((t) => {
          if (t.art !== 'clip') return { ...t, ...(t.bei !== undefined ? { bei: zuSchnittzeit(t.bei, behalten, 'anfang') ?? undefined } : {}) }
          const von = zuSchnittzeit(t.von, behalten, 'anfang')
          const bis = zuSchnittzeit(t.bis, behalten, 'ende')
          return von !== null && bis !== null && bis - von >= 0.2 ? { ...t, von, bis } : null
        })
        .filter((t): t is IntroTeil => t !== null)
      if (teile.length) aus.push({ ...e, teile })
      continue
    }
    if ('von' in e) {
      const von = zuSchnittzeit(e.von, behalten, 'anfang')
      const bis = zuSchnittzeit(e.bis, behalten, 'ende')
      if (von !== null && bis !== null && bis > von) aus.push({ ...e, von, bis } as Effekt)
      continue
    }
    const bei = zuSchnittzeit(e.bei, behalten, 'anfang')
    if (bei !== null) aus.push({ ...e, bei } as Effekt)
  }
  return aus
}

/** Prüft eine Effektliste (von der KI oder aus der Datei): unbekannte Arten und unmögliche Werte fliegen raus. */
export function pruefeEffekte(roh: unknown, laenge: number): { effekte: Effekt[]; fehler: string[] } {
  const effekte: Effekt[] = []
  const fehler: string[] = []
  for (const [i, x] of (Array.isArray(roh) ? roh : []).entries()) {
    const e = x as Record<string, unknown>
    const art = String(e?.['art'] ?? '')
    if (!(EFFEKT_ARTEN as readonly string[]).includes(art)) {
      fehler.push(`Effekt ${i + 1}: unbekannte Art „${art}“`)
      continue
    }
    const zeit = (k: string): number | null => (typeof e[k] === 'number' && Number.isFinite(e[k]) ? klemme(e[k] as number, 0, laenge) : null)
    const bereich = 'von' in e ? [zeit('von'), zeit('bis')] : null
    if (bereich && (bereich[0] === null || bereich[1] === null || bereich[1]! <= bereich[0]!)) {
      fehler.push(`Effekt ${i + 1} (${art}): ungültiger Bereich`)
      continue
    }
    if ('bei' in e && zeit('bei') === null) {
      fehler.push(`Effekt ${i + 1} (${art}): ungültige Zeit`)
      continue
    }
    if (art === 'intro') {
      // Teile prüfen: Clips innerhalb des Videos, Karten mit Text; kaputte Teile fallen weg
      const teile = (Array.isArray(e['teile']) ? e['teile'] : [])
        .map((t: Record<string, unknown>) => {
          if (t?.['art'] === 'clip' && typeof t['von'] === 'number' && typeof t['bis'] === 'number') {
            const von = klemme(t['von'], 0, laenge)
            const bis = klemme(t['bis'], 0, laenge)
            return bis - von >= 0.2 ? { ...t, von, bis } : null
          }
          if (t?.['art'] === 'karte' && String(t['text'] ?? '').trim()) return { ...t, text: String(t['text']) }
          if (t?.['art'] === 'sting') {
            const vorlage = (STING_VORLAGEN as readonly string[]).includes(String(t['vorlage'])) ? t['vorlage'] : 'sprung'
            return { ...t, vorlage, ...(String(t['text'] ?? '').trim() ? { text: String(t['text']) } : { text: undefined }) }
          }
          return null
        })
        .filter((t): t is NonNullable<typeof t> => t !== null)
      if (!teile.length) {
        fehler.push(`Effekt ${i + 1}: Intro ohne gültige Teile`)
        continue
      }
      effekte.push({ ...(e as object), teile } as Effekt)
      continue
    }
    if ((art === 'video' || art === 'bild') && !String(e['datei'] ?? '').trim()) {
      fehler.push(`Effekt ${i + 1}: Datei fehlt`)
      continue
    }
    if (art === 'text' && !String(e['text'] ?? '').trim()) {
      fehler.push(`Effekt ${i + 1}: Text fehlt`)
      continue
    }
    effekte.push({ ...(e as object), ...(bereich ? { von: bereich[0]!, bis: bereich[1]! } : {}), ...('bei' in e ? { bei: zeit('bei')! } : {}) } as Effekt)
  }
  return { effekte, fehler }
}
