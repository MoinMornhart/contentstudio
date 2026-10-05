import type { SchnittFormat } from '@shared/schnitt'

/**
 * Schnitt-Stil je Richtung (ROADMAP 5.3): Tempo, Schnitthärte, Zoom-Häufigkeit, Untertitel und Effekt-Dichte. Gaming,
 * Comedy und Reactions schneiden eng und setzen viele Akzente; Kochen, Bildung und Podcasts lassen Pausen stehen,
 * damit Handgriffe und Erklärungen wirken. Freie Richtungen bekommen den Stil der ähnlichsten bekannten.
 */
export interface SchnittStil {
  name: 'reaction' | 'schnell' | 'normal' | 'ruhig'
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
  // Pausen und Puffer nach der Recherche zu Reaction- und Gaming-Schnitt (aus MoinStudio v0.49.0): Reaction 0,5 s,
  // Gaming 0,6 s, knapper Puffer
  reaction: { name: 'reaction', maxPause: 0.5, vorlauf: 0.1, nachlauf: 0.15, minEntfernen: 0.3, leiseAnteil: 0.35, fuellwoerter: true, zoomAbstand: 20, zoomFaktor: 1.18, untertitelWoerter: 5, effektDichte: 'viel' },
  schnell: { name: 'schnell', maxPause: 0.6, vorlauf: 0.1, nachlauf: 0.15, minEntfernen: 0.3, leiseAnteil: 0.35, fuellwoerter: true, zoomAbstand: 15, zoomFaktor: 1.14, untertitelWoerter: 5, effektDichte: 'viel' },
  normal: { name: 'normal', maxPause: 0.8, vorlauf: 0.15, nachlauf: 0.3, minEntfernen: 0.35, leiseAnteil: 0.35, fuellwoerter: true, zoomAbstand: 25, zoomFaktor: 1.1, untertitelWoerter: 6, effektDichte: 'mittel' },
  ruhig: { name: 'ruhig', maxPause: 1.4, vorlauf: 0.25, nachlauf: 0.45, minEntfernen: 0.5, leiseAnteil: 0.25, fuellwoerter: true, zoomAbstand: 45, zoomFaktor: 1.06, untertitelWoerter: 8, effektDichte: 'wenig' }
}

/** Richtungen (Vorschläge aus dem Profil und freie Wörter) → Stil */
const ZUORDNUNG: [RegExp, SchnittStil['name']][] = [
  [/react/i, 'reaction'],
  [/gaming|spiel|game|minecraft|fortnite|roblox|comedy|lustig|stream|esport|prank|challenge/i, 'schnell'],
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

/**
 * Schnitt-Regeln aus der Recherche erfolgreicher Creator (aus MoinStudio v0.49.0, verallgemeinert): gemeinsame Regeln
 * für jedes Video im Querformat, dazu Regeln für Reactions und für Gaming. Die KI hält sich daran beim Rohschnitt, bei
 * Wünschen in Worten und bei der Suche nach Höhepunkten.
 */
const GEMEINSAM = `Gemeinsame Regeln (Recherche erfolgreicher Creator):
- Hook 0–15 s: Cold Open mit dem besten Moment (2–5 s), dann ein Satz, der das Versprechen von Titel/Thumbnail bestätigt,
  dann direkt Inhalt. Kein Logo-Intro, keine lange Begrüßung vor Sekunde 10.
- Rhythmus: in den ersten 3 Minuten alle 10–20 s eine sichtbare Veränderung (Zoom, Text, Sound), danach alle 25–40 s.
  Etwa alle 2 Minuten auf etwas Kommendes vorgreifen.
- Fast nur harte Schnitte; höchstens kurze Whip-/Zoom-Übergänge (0,2–0,4 s) mit Whoosh.
- Sounds framegenau auf die Bildänderung, nie lauter als die Stimme, denselben Sound nicht ständig.
- Text 1–4 Wörter, mindestens 0,7 s sichtbar, nie in den unteren 12 % (Player-Leiste).
- Abo-Hinweis erst nach dem ersten Höhepunkt (30–90 s) oder am Ende, unter 3 s – nie im Hook.
- Kein „Das war's“-Outro; der Inhalt läuft bis zum Ende, die Endcard liegt in den letzten 5–20 s.`

const HOCHFORMAT = `Regeln für Hochformat (Shorts, Reels, TikTok):
- Die erste Sekunde entscheidet: sofort der stärkste Moment, kein Anlauf.
- Alle 2–4 s eine Veränderung, Untertitel groß in der Bildmitte, keine Pausen.
- Der Schluss führt nahtlos zurück zum Anfang (Loop), kein Abspann.`

const REACTION = `Reactions (der Creator reagiert auf ein Video; die Facecam ist im Bild):
- Nach spätestens 15–30 s Original muss eine Reaktion kommen – lange Original-Passagen ohne Kommentar kürzen. Ziel
  40–50 % Kommentar (schützt auch vor YouTubes Regel gegen wiederverwendete Inhalte).
- Reaktion betonen: erst den Auslöser zeigen, dann die Reaktion mit schnellem Zoom (110–130 %), bei Bedarf Boom-Sound
  oder kurzer Freeze; starke Momente als Replay.
- Stream-Leerlauf rigoros raus: Chat vorlesen ohne Pointe, Warten, Laden, Werbung, „ich schau mir das jetzt an“.
- Meme-/Text-Einblendungen höchstens etwa eine alle 20–30 s.`

const GAMING = `Gaming:
- Highlights: Lautstärkespitzen in Stimme und Spiel; Gespräche, Lachen, „Nein!“ zählen oft mehr als das Spiel.
- Pro Highlight 3–8 s Vorlauf, der Moment, 1–3 s Reaktion. Farmen, Bauen, Laufen raffen.
- Zoom-Punch 115–150 % in 2–4 Frames mit Boom/Whoosh, höchstens alle 10–20 s.
- Zeitlupe (25–50 %) beim entscheidenden Moment, Replay bei Fails, Freeze mit Text vor einem Fail.
- Story statt Liste: Ziel in den ersten 15 s, Zwischenstände als Text („Tag 3“, „2/5“), Finale am Ende.`

/** Beschreibung des Stils für die KI (Rohschnitt, Wünsche, Highlights) */
export function stilText(s: SchnittStil, richtungen: string[], format: SchnittFormat = '16:9', regeln = true): string {
  const tempo = { reaction: 'eng geschnitten, Reaktionen im Mittelpunkt', schnell: 'schnell und eng geschnitten, viele Akzente an Höhepunkten', normal: 'zügig, natürliche Pausen bleiben', ruhig: 'ruhig, Pausen zum Zuschauen und Nachdenken bleiben stehen' }[s.name]
  const zeile = `Richtung: ${richtungen.join(', ') || 'allgemein'} – Schnitt ${tempo}; Effekte ${s.effektDichte === 'viel' ? 'knackig und häufiger' : s.effektDichte === 'mittel' ? 'gezielt an Höhepunkten' : 'sparsam, nur wo sie helfen'}.`
  if (!regeln) return zeile
  const art = s.name === 'reaction' ? REACTION : richtungen.some((r) => /gaming|spiel|game|minecraft|fortnite|roblox|esport/i.test(r)) ? GAMING : null
  return [zeile, format === '9:16' ? HOCHFORMAT : GEMEINSAM, art].filter(Boolean).join('\n\n')
}
