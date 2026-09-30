import type { SchnittFormat } from '@shared/schnitt'

/**
 * Schnitt-Stil je Richtung (ROADMAP 5.3): Tempo, Schnitthärte, Zoom-Häufigkeit, Untertitel und Effekt-Dichte. Gaming,
 * Comedy und Reactions schneiden eng und setzen viele Akzente; Kochen, Bildung und Podcasts lassen Pausen stehen,
 * damit Handgriffe und Erklärungen wirken. Freie Richtungen bekommen den Stil der ähnlichsten bekannten.
 */
export interface SchnittStil {
  name: 'schnell' | 'normal' | 'ruhig'
  /** Pausen bis zu dieser Länge bleiben ganz */
  maxPause: number
  /** Luft vor dem ersten und nach dem letzten Wort eines Redeblocks */
  vorlauf: number
  nachlauf: number
  /** kürzere Bereiche lohnen keinen Schnitt */
  minEntfernen: number
  /** Action nur, wenn die Pause lauter ist als dieser Anteil der Sprach-Lautstärke */
  leiseAnteil: number
  /** Füllwörter („ähm“, „um“) herausschneiden */
  fuellwoerter: boolean
  /** automatische Zooms: höchstens einer je so viele Sekunden, Stärke */
  zoomAbstand: number
  zoomFaktor: number
  /** Wörter je Untertitel-Einblendung */
  untertitelWoerter: number
  /** Hinweis an die KI, wie viele Effekte passen */
  effektDichte: 'wenig' | 'mittel' | 'viel'
}

const STILE: Record<SchnittStil['name'], SchnittStil> = {
  schnell: { name: 'schnell', maxPause: 0.6, vorlauf: 0.1, nachlauf: 0.22, minEntfernen: 0.3, leiseAnteil: 0.35, fuellwoerter: true, zoomAbstand: 15, zoomFaktor: 1.14, untertitelWoerter: 5, effektDichte: 'viel' },
  normal: { name: 'normal', maxPause: 0.8, vorlauf: 0.15, nachlauf: 0.3, minEntfernen: 0.35, leiseAnteil: 0.35, fuellwoerter: true, zoomAbstand: 25, zoomFaktor: 1.1, untertitelWoerter: 6, effektDichte: 'mittel' },
  ruhig: { name: 'ruhig', maxPause: 1.4, vorlauf: 0.25, nachlauf: 0.45, minEntfernen: 0.5, leiseAnteil: 0.25, fuellwoerter: true, zoomAbstand: 45, zoomFaktor: 1.06, untertitelWoerter: 8, effektDichte: 'wenig' }
}

/** Richtungen (Vorschläge aus dem Profil und freie Wörter) → Stil */
const ZUORDNUNG: [RegExp, SchnittStil['name']][] = [
  [/gaming|spiel|game|minecraft|fortnite|roblox|comedy|lustig|react|stream|esport|prank|challenge/i, 'schnell'],
  [/koch|back|rezept|food|bildung|lern|tutorial|erkl|wissen|doku|podcast|interview|meditation|yoga|asmr|handwerk|diy|garten/i, 'ruhig'],
  [/vlog|tech|beauty|fitness|musik|kinder|business|reise|mode|auto|sport/i, 'normal']
]

export function stilFuer(richtungen: string[], format: SchnittFormat = '16:9'): SchnittStil {
  let name: SchnittStil['name'] = 'normal'
  for (const r of richtungen) {
    const treffer = ZUORDNUNG.find(([re]) => re.test(r))
    if (treffer) {
      name = treffer[1]
      break
    }
  }
  const s = { ...STILE[name] }
  // Hochformat (Shorts, Reels, TikTok) ist immer etwas enger geschnitten, mit kurzen Untertiteln
  if (format === '9:16') {
    s.maxPause = Math.round(s.maxPause * 0.75 * 100) / 100
    s.nachlauf = Math.round(s.nachlauf * 0.8 * 100) / 100
    s.untertitelWoerter = Math.min(s.untertitelWoerter, 4)
    s.zoomAbstand = Math.round(s.zoomAbstand * 0.6)
  }
  return s
}

/** Beschreibung des Stils für die KI (Rohschnitt, Wünsche, Highlights) */
export function stilText(s: SchnittStil, richtungen: string[]): string {
  const tempo = { schnell: 'schnell und eng geschnitten, viele Akzente an Höhepunkten', normal: 'zügig, natürliche Pausen bleiben', ruhig: 'ruhig, Pausen zum Zuschauen und Nachdenken bleiben stehen' }[s.name]
  return `Richtung: ${richtungen.join(', ') || 'allgemein'} – Schnitt ${tempo}; Effekte ${s.effektDichte === 'viel' ? 'knackig und häufiger' : s.effektDichte === 'mittel' ? 'gezielt an Höhepunkten' : 'sparsam, nur wo sie helfen'}.`
}
