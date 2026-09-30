import { analysiere, uebertrageFarben } from '../bild/analyse'
import { liesBild, schreibePng, type RohBild } from '../bild/rohbild'
import type { AuftragsVorbildDaten } from './kontext'

/**
 * Was ein Auftrags-Vorbild am fertigen Bild sicher und nachprüfbar ändert (ROADMAP 4.2): „Farben“ überträgt die
 * Farbstimmung, „Licht“ gleicht Helligkeit und Kontrast an. Der Bildaufbau bleibt dabei unberührt – Aufbau, Pose, Kamera
 * und Textstil wirken über die Planung.
 */
export async function wendeVorbilderAn(roh: string, auftrag: AuftragsVorbildDaten[], ziel: string): Promise<boolean> {
  const farben = auftrag.find((a) => a.uebernehmen.includes('farben'))
  const licht = auftrag.find((a) => a.uebernehmen.includes('licht'))
  if (!farben && !licht) return false
  let bild = await liesBild(roh)
  if (farben) bild = uebertrageFarben(bild, await liesBild(farben.pfad), 0.75)
  if (licht) bild = gleicheLichtAn(bild, analysiere(await liesBild(licht.pfad)))
  await schreibePng(ziel, bild)
  return true
}

/** Helligkeit und Kontrast in Richtung der Referenz verschieben (halbe Strecke, damit Gesichter lesbar bleiben) */
export function gleicheLichtAn(b: RohBild, ref: { helligkeit: number; kontrast: number }): RohBild {
  const a = analysiere(b)
  const zielHell = a.helligkeit + (ref.helligkeit - a.helligkeit) * 0.5
  const faktorK = Math.max(0.7, Math.min(1.4, 1 + ((ref.kontrast - a.kontrast) / Math.max(0.1, a.kontrast)) * 0.5))
  const out = new Uint8Array(b.data.length)
  for (let i = 0; i < b.width * b.height; i++) {
    for (let c = 0; c < 3; c++) {
      const v = b.data[i * 4 + c]! / 255
      const k = (v - a.helligkeit) * faktorK + zielHell
      out[i * 4 + c] = Math.max(0, Math.min(255, Math.round(k * 255)))
    }
    out[i * 4 + 3] = b.data[i * 4 + 3]!
  }
  return { width: b.width, height: b.height, data: out }
}
