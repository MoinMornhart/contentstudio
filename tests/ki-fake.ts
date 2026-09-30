import { KiSchicht } from '../src/main/ki/schicht'
import type { KiAnbieter, RohAnfrage } from '../src/main/ki/typen'

/**
 * Test-KI: beantwortet jede Anfrage mit `antwort(anfrage)` (JSON-Wert). Merkt sich alle Anfragen. `bilder` = kann
 * Bilder sehen (für Vorbild-Analyse, Selbstprüfung, Video).
 */
export function fakeKi(antwort: (a: RohAnfrage) => unknown, o: { bilder?: boolean; id?: string } = {}): { schicht: KiSchicht; anfragen: RohAnfrage[] } {
  const anfragen: RohAnfrage[] = []
  const a: KiAnbieter = {
    id: o.id ?? 'fake',
    art: 'lokal',
    faehigkeiten: { text: true, bilderSehen: o.bilder ?? true, werkzeuge: false, jsonSchema: true, lange: true },
    pruefe: async () => ({ installiert: true, bereit: true, hinweis: null }),
    frage: async (r) => {
      anfragen.push(r)
      const d = antwort(r)
      return { text: JSON.stringify(d), strukturiert: d, modell: 'fake-1', nutzung: null }
    }
  }
  return { schicht: new KiSchicht(new Map([[a.id, a]]), async () => [{ id: a.id, aktiv: true }]), anfragen }
}
