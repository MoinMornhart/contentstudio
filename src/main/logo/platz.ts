// Herkunft: MoinStudio src/main/logo/platz.ts (MIT), v0.38.0.
import { LOGO_GROESSEN, type LogoGroesse, type LogoPosition } from '@shared/logo'
import { ueberlappung, type Box } from '../bild/komposit'
import { t } from '../i18n'

/**
 * Wo das Logo im Thumbnail steht: in einer freien Ecke, nie über Köpfen, Figuren, Gegenständen, Titeln oder Text. Alle
 * Angaben in Bildanteilen 0–1, oben links = 0,0.
 */

export type Ecke = Exclude<LogoPosition, 'auto'>

/** Fläche des Logos als Anteil der Bildfläche (so wirken breite Schriftzüge und runde Zeichen gleich groß) */
export const LOGO_FLAECHE: Record<LogoGroesse, number> = { winzig: 0.006, klein: 0.012, mittel: 0.022, gross: 0.04, riesig: 0.065 }
/** Abstand zum Bildrand als Anteil der Bildbreite */
const RAND = 0.025
/** YouTube zeigt unten rechts die Videolänge – dort landet das Logo nur, wenn es ausdrücklich gewünscht ist */
export const ZEITSTEMPEL: Box = [0.84, 0.86, 1, 1]
/** Reihenfolge für „automatisch“: unten links, dann oben, zuletzt unten rechts */
const REIHENFOLGE: Ecke[] = ['unten_links', 'oben_rechts', 'oben_links', 'unten_rechts']
/** Schrittweise kleiner, bevor ein Logo über Wichtigem landen würde */
const STUFEN = [1, 0.85, 0.7, 0.55]
/** Schritte (Anteil der Bildbreite), um die das Logo an der Kante entlang nach innen rückt, wenn die Ecke belegt ist */
const RUECKEN = [0, 0.06, 0.12, 0.18]

const istZahl = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
export function istBox(b: unknown): b is Box {
  return Array.isArray(b) && b.length === 4 && b.every(istZahl) && b[2] > b[0] && b[3] > b[1]
}

/** Box des Logos in einer Ecke; `ruecken` schiebt es an der waagerechten Kante zur Bildmitte. */
export function logoBox(ecke: Ecke, flaeche: number, logoVerhaeltnis: number, bildVerhaeltnis: number, ruecken = 0): Box {
  // w · h = Fläche, h = w · Bildverhältnis / Logoverhältnis (h als Anteil der Bildhöhe)
  let w = Math.sqrt((flaeche * logoVerhaeltnis) / bildVerhaeltnis)
  let h = (w * bildVerhaeltnis) / logoVerhaeltnis
  // sehr breite oder hohe Logos begrenzen
  const f = Math.min(1, 0.45 / w, 0.4 / h)
  w *= f
  h *= f
  const randY = RAND * bildVerhaeltnis
  const x = ecke.endsWith('links') ? RAND + ruecken : 1 - RAND - ruecken - w
  const y = ecke.startsWith('oben') ? randY : 1 - randY - h
  return [x, y, x + w, y + h].map((v) => Math.round(v * 10000) / 10000) as Box
}

export interface LogoPlatz {
  box: Box
  ecke: Ecke
  /** false: nirgends frei, das Logo würde etwas überdecken (kleinste Größe, geringste Überdeckung) */
  frei: boolean
  /** kleiner als gewünscht, damit es frei steht */
  verkleinert: boolean
  /** die gewünschte Ecke war belegt, das Logo steht woanders */
  ausgewichen: boolean
}

/**
 * Wählt den Platz: gewünschte Ecke (oder alle Ecken der Reihe nach), an der Kante entlang nach innen, dann schrittweise
 * kleiner. Ist die gewünschte Ecke auch klein belegt, weicht das Logo in eine freie Ecke aus.
 */
export function waehleLogoPlatz(o: { sperren: Box[]; logoVerhaeltnis: number; bildVerhaeltnis?: number; groesse: LogoGroesse; position: LogoPosition }): LogoPlatz {
  const bildV = o.bildVerhaeltnis ?? 16 / 9
  const logoV = istZahl(o.logoVerhaeltnis) && o.logoVerhaeltnis > 0 ? o.logoVerhaeltnis : 1
  const flaeche = LOGO_FLAECHE[o.groesse] ?? LOGO_FLAECHE.mittel
  const auto = o.position === 'auto'
  // etwas Luft um alles Wichtige
  const sperren = o.sperren.filter(istBox).map((b): Box => [b[0] - 0.012, b[1] - 0.02, b[2] + 0.012, b[3] + 0.02])
  const alle = auto ? [...sperren, ZEITSTEMPEL] : sperren
  const ecken = auto ? REIHENFOLGE : [o.position as Ecke]
  const belegt = (b: Box): number => alle.reduce((n, s) => n + ueberlappung(b, s), 0)
  for (const [i, stufe] of STUFEN.entries())
    for (const ecke of ecken)
      for (const r of RUECKEN) {
        const box = logoBox(ecke, flaeche * stufe, logoV, bildV, r)
        if (belegt(box) === 0) return { box, ecke, frei: true, verkleinert: i > 0, ausgewichen: false }
      }
  if (!auto) {
    const anders = waehleLogoPlatz({ ...o, position: 'auto' })
    return { ...anders, ausgewichen: anders.frei || anders.ausgewichen }
  }
  // Nirgends frei: kleinste Stufe mit der geringsten Überdeckung
  const kleinste = flaeche * STUFEN[STUFEN.length - 1]!
  let beste: { box: Box; ecke: Ecke; wert: number } | null = null
  for (const ecke of ecken)
    for (const r of RUECKEN) {
      const box = logoBox(ecke, kleinste, logoV, bildV, r)
      const wert = belegt(box)
      if (!beste || wert < beste.wert) beste = { box, ecke, wert }
    }
  return { box: beste!.box, ecke: beste!.ecke, frei: false, verkleinert: true, ausgewichen: false }
}

/** Hinweise, wenn das Logo nicht wie gewünscht stehen konnte */
export function platzHinweise(p: LogoPlatz, gewuenscht: LogoPosition): string[] {
  if (!p.frei) return [t('logo.platz.belegt')]
  if (p.ausgewichen && gewuenscht !== 'auto') return [t('logo.platz.ausgewichen', { gewuenscht: t(`logo.ecke.${gewuenscht}`), ecke: t(`logo.ecke.${p.ecke}`) })]
  if (p.verkleinert) return [t('logo.platz.kleiner')]
  return []
}

/**
 * Änderung in Worten am Logo eines Thumbnails („Logo kleiner“, „Logo nach links“, „Logo weg“, „logo bigger“ …), ohne KI.
 * Liefert die neue Wahl, null = Logo weg, undefined = der Wunsch betrifft das Logo nicht.
 */
export function logoAusWunsch(wunsch: string, bisher: { position: LogoPosition; groesse: LogoGroesse }): { position: LogoPosition; groesse: LogoGroesse } | null | undefined {
  const w = wunsch.toLowerCase()
  if (!/\blogos?\b/.test(w)) return undefined
  if (/(logo|logos)\s*(weg|entfernen|raus|löschen|loeschen|ausblenden)|ohne\s+logo|kein(en)?\s+logo|(remove|delete|hide|drop)\s+(the\s+)?logo|logo\s+(off|away)|no\s+logo/.test(w)) return null
  let { position, groesse } = bisher
  const stufe = LOGO_GROESSEN.indexOf(groesse)
  const um = (n: number): LogoGroesse => LOGO_GROESSEN[Math.max(0, Math.min(LOGO_GROESSEN.length - 1, stufe + n))]!
  if (/viel\s+(kleiner|small)|much\s+smaller|winzig|tiny/.test(w)) groesse = um(-2)
  else if (/viel\s+größer|viel\s+groesser|much\s+(bigger|larger)|riesig|huge/.test(w)) groesse = um(2)
  else if (/kleiner|smaller/.test(w)) groesse = um(-1)
  else if (/größer|groesser|bigger|larger/.test(w)) groesse = um(1)
  const ecke = position === 'auto' ? 'unten_links' : position
  const links = /links|\bleft\b/.test(w)
  const rechts = /rechts|\bright\b/.test(w)
  const oben = /oben|\btop\b|\bup\b/.test(w)
  const unten = /unten|\bbottom\b|\bdown\b/.test(w)
  if (links || rechts || oben || unten) {
    const v = oben ? 'oben' : unten ? 'unten' : ecke.split('_')[0]!
    const h = links ? 'links' : rechts ? 'rechts' : ecke.split('_')[1]!
    position = `${v}_${h}` as LogoPosition
  }
  return { position, groesse }
}
