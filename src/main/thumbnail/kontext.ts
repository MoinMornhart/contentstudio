import type { AuftragsVorbild, BeispielStilbuch, LokaleAnalyseDaten, Stilbuch, Uebernehmen, Vorbild } from '@shared/thumbnail'
import { waehleVorbilder } from './vorbilder'

/**
 * Stil-Kontext eines Auftrags (ROADMAP 4.1, 4.2, 4.6): Regeln aus dem Stilbuch des Kanals, die wichtigsten Vorbilder
 * (jede geplante Variante nennt eines davon) und Vorbilder nur für diesen Auftrag mit dem, was übernommen werden soll.
 * Alles als Text für die Planung und als Daten für die Nachbearbeitung (Farben, Licht, Aufbau).
 */
export interface PlanVorbild {
  id: string
  kanal: string
  titel: string
  zeigt: string
  rezept: string
  link: string | null
}

export interface AuftragsVorbildDaten extends AuftragsVorbild {
  /** Absoluter Pfad des Bildes */
  pfad: string
  /** Beschreibung durch Bild-KI oder aus der lokalen Messung */
  beschreibung: string
  lokal: LokaleAnalyseDaten | null
  /** Aus der Analyse: auf welcher Seite die Hauptperson steht */
  seite: 'links' | 'mitte' | 'rechts' | null
}

export interface StilKontext {
  regeln: { kategorie: string; text: string; staerke: number }[]
  vorbilder: PlanVorbild[]
  auftrag: AuftragsVorbildDaten[]
  werte: Stilbuch['werte']
  /** Markenfarben */
  farben: string[]
}

/** Kurzbeschreibung eines Bildes aus den Messwerten (wenn keine Bild-KI da ist) */
export function lokalText(l: LokaleAnalyseDaten | null): string {
  if (!l) return ''
  const hell = l.helligkeit >= 0.55 ? 'hell' : l.helligkeit < 0.33 ? 'dunkel' : 'mittelhell'
  const satt = l.saettigung >= 0.45 ? 'kräftige Farben' : l.saettigung < 0.22 ? 'gedeckte Farben' : 'natürliche Farben'
  const kontrast = l.kontrast >= 0.55 ? 'starker Kontrast' : 'weicher Kontrast'
  const seite = l.schwerpunkt[0] < 0.45 ? 'Blickfang links' : l.schwerpunkt[0] > 0.55 ? 'Blickfang rechts' : 'Blickfang mittig'
  return `${hell}, ${satt} (${l.farben.map((f) => f.farbe).join(', ')}), ${kontrast}, ${seite}, ${l.detail < 0.18 ? 'ruhiger Hintergrund' : 'detailreich'}`
}

export function seiteAus(l: LokaleAnalyseDaten | null): 'links' | 'mitte' | 'rechts' | null {
  if (!l) return null
  return l.schwerpunkt[0] < 0.45 ? 'links' : l.schwerpunkt[0] > 0.55 ? 'rechts' : 'mitte'
}

export function planVorbildAus(v: Vorbild): PlanVorbild {
  return {
    id: v.id,
    kanal: v.kanal ?? 'eigenes Vorbild',
    titel: v.titel ?? '',
    zeigt: v.ki?.zeigt ? `${v.ki.zeigt}. Aufbau: ${v.ki.bildaufbau}. Kamera: ${v.ki.kamera}. Licht: ${v.ki.licht}` : lokalText(v.lokal),
    rezept: v.ki?.rezept ?? `Bildwirkung übernehmen: ${lokalText(v.lokal)}`,
    link: v.link
  }
}

export function stilKontext(o: {
  vorbilder: Vorbild[]
  stilbuch: Stilbuch | null
  beispiel: BeispielStilbuch | null
  auftrag: AuftragsVorbildDaten[]
  farben: string[]
  anzahl?: number
}): StilKontext {
  const eigene = waehleVorbilder(o.vorbilder, o.anzahl ?? 8).map(planVorbildAus)
  // Wenige eigene Vorbilder: Beispiele der Richtung ergänzen (nur öffentliche Titel und Beschreibungen)
  const beispiele =
    eigene.length < 3 && o.beispiel
      ? o.beispiel.vorbilder.map((b) => ({ id: b.id, kanal: b.kanal, titel: b.titel, zeigt: b.zeigt, rezept: b.rezept, link: `https://www.youtube.com/watch?v=${b.video}` }))
      : []
  const regeln = (o.stilbuch?.regeln ?? o.beispiel?.regeln.map((r) => ({ ...r, belege: [], staerke: 0.5 })) ?? []).map((r) => ({ kategorie: r.kategorie, text: r.text, staerke: r.staerke }))
  return { regeln, vorbilder: [...eigene, ...beispiele], auftrag: o.auftrag, werte: o.stilbuch?.werte ?? null, farben: o.farben }
}

const UEBERNEHMEN_TEXT: Record<Uebernehmen, string> = {
  farben: 'die Farben und die Farbstimmung',
  aufbau: 'den Bildaufbau (wo Person, Thema und freie Flächen liegen)',
  licht: 'das Licht (Richtung, Härte, Helligkeit)',
  pose: 'Pose und Ausdruck der Person',
  kamera: 'Kamera (Nähe, Perspektive, Brennweite)',
  textstil: 'den Textstil (Größe, Lage, Farbe – nicht den Wortlaut)'
}

/** Texte für die Planungs-Vorlagen */
export function kontextTexte(k: StilKontext): { stilbuch: string; vorbilder: string; auftragsvorbilder: string } {
  const stilbuch = k.regeln.length
    ? k.regeln.map((r) => `- [${r.kategorie}] ${r.text}`).join('\n') +
      (k.werte ? `\n- Messwerte der Vorbilder: Helligkeit ${k.werte.helligkeit}, Kontrast ${k.werte.kontrast}, Sättigung ${k.werte.saettigung}, Hauptfarben ${k.werte.farben.join(', ')}` : '') +
      (k.farben.length ? `\n- Markenfarben: ${k.farben.join(', ')}` : '')
    : 'Noch kein Stilbuch: gute, klare Thumbnails nach allgemeinen Regeln (eine Aussage, großes Gesicht, starker Kontrast, wenig Text).'
  const vorbilder = k.vorbilder.length
    ? k.vorbilder.map((v) => `- id ${v.id} – ${v.kanal}${v.titel ? `: „${v.titel}“` : ''}. Zeigt: ${v.zeigt}. Rezept: ${v.rezept}`).join('\n')
    : '- id frei – kein Vorbild vorhanden: nenne als vorbild „frei“.'
  const auftragsvorbilder = k.auftrag.length
    ? `\n\n# Vorbilder nur für diesen Auftrag (Vorrang vor Stilbuch und Kanal-Vorbildern)\n\n${k.auftrag
        .map(
          (a, i) =>
            `${i + 1}. Übernimm davon NUR ${a.uebernehmen.map((u) => UEBERNEHMEN_TEXT[u]).join(', ')}. Alles andere kommt aus Beschreibung und Stilbuch. Nie Logos, Texte, Figuren oder Bildteile übernehmen.${a.hinweis ? ` Hinweis des Creators: „${a.hinweis}“.` : ''} Das Bild: ${a.beschreibung}`
        )
        .join('\n')}`
    : ''
  return { stilbuch, vorbilder, auftragsvorbilder }
}
