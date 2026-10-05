// Herkunft: MoinStudio src/main/dateinamen.ts (MIT, v0.38.0).
/**
 * Schöne Dateinamen für alles, was ContentStudio speichert (aus MoinStudio v0.38.0): Thumbnails heißen
 * „Thumbnail_2026-09-30_19-05.png“, Videos wie das Video, Shorts „<Video>_Short_1.mp4“ – keine IDs, kein „variante-1“.
 * Nur Zeichen, die Windows erlaubt; Umlaute bleiben.
 */

// Namen, die Windows für Geräte reserviert (auch mit Endung, z. B. „CON.png“)
const RESERVIERT = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** Text → sicherer Dateiname ohne Endung: ohne Emojis, ohne \ / : * ? " < > |, ohne Punkt oder Leerzeichen am Ende. */
export function sichererName(text: string, ersatz = 'Video', maxLaenge = 80): string {
  let name = text
    .replace(/\p{Extended_Pictographic}|️|‍/gu, '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (name.length > maxLaenge) name = name.slice(0, maxLaenge).replace(/\s+\S*$/, '') || name.slice(0, maxLaenge)
  name = name.replace(/[. ]+$/, '').replace(/^[. -]+/, '')
  if (!name) return ersatz
  return RESERVIERT.test(name) ? `${name}_` : name
}

/** Datum und Uhrzeit (lokale Zeit) als „2026-09-30_19-05“ */
export function zeitStempel(d: Date): string {
  const z = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}-${z(d.getMinutes())}`
}

/**
 * Thumbnail: „[<Video>_]Thumbnail_<Datum>_<Uhrzeit>[_V2][_Aenderung3].png“. Die Variante steht nur dabei, wenn der
 * Auftrag mehrere hat; `aenderung` ist die laufende Nummer der Änderung im Verlauf.
 */
export function thumbnailDateiname(o: { video?: string | null; zeit: Date; variante: number; varianten: number; aenderung?: number | null; endung: string }): string {
  const teile = [o.video?.trim() ? sichererName(o.video, '', 60) : '', 'Thumbnail', zeitStempel(o.zeit)].filter(Boolean)
  if (o.varianten > 1) teile.push(`V${o.variante + 1}`)
  if (o.aenderung) teile.push(`Aenderung${o.aenderung}`)
  return `${teile.join('_')}.${o.endung.replace(/^\./, '')}`
}

/** Video und alles, was dazugehört (Untertitel, Beschreibung, Premiere-Sequenz): „<Video>.<endung>“ */
export const videoDateiname = (name: string, endung: string): string => `${sichererName(name)}.${endung.replace(/^\./, '')}`

/** Short oder Clip aus einem Höhepunkt: „<Video>_Short_1.mp4“, Nummer = Nummer des Höhepunkts (ab 1) */
export const clipDateiname = (name: string, art: 'clip' | 'short', nummer: number): string => `${sichererName(name, 'Video', 60)}_${art === 'short' ? 'Short' : 'Clip'}_${nummer}.mp4`

/** Standardname eines Videos: Titel bzw. Projektname, sonst der Name der Originaldatei ohne Endung */
export function videoName(o: { name?: string | null; quelle?: string | null }): string {
  const name = o.name?.trim()
  if (name) return name
  const datei = (o.quelle ?? '').split(/[\\/]/).pop() ?? ''
  return datei.replace(/\.[^.]+$/, '') || 'Video'
}
