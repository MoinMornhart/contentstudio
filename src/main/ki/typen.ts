/**
 * KI-Schicht (ROADMAP M3): ein Auftrag, viele Anbieter. MoinStudio sprach nur mit `claude -p` und Claude Desktop;
 * ContentStudio beschreibt jeden Auftrag unabhängig vom Anbieter (Prompt + JSON-Schema), und jeder Anbieter übersetzt
 * ihn in seine Form. Welche Anbieter erlaubt sind und warum: docs/ki-anbieter.md.
 */
import type { z } from 'zod'
import type { JobContext } from '../jobs/queue'
import type { Preis } from './kosten'

export interface KiFaehigkeiten {
  text: boolean
  /** Kann Bilder ansehen (Selbstprüfung von Thumbnails, Sichtbogen im Schnitt) */
  bilderSehen: boolean
  /** Kann Werkzeuge aufrufen (z. B. MCP) */
  werkzeuge: boolean
  /** Hält sich verlässlich an ein JSON-Schema (sonst: „nur JSON“ + Reparaturschleife) */
  jsonSchema: boolean
  /** Verträgt lange Eingaben (Transkripte von Stunden-Streams) */
  lange: boolean
}

export type KiArt = 'abo' | 'lokal' | 'api'

export interface KiStatus {
  /** Programm/Dienst vorhanden (CLI installiert, lokaler Server läuft, Schlüssel gespeichert) */
  installiert: boolean
  /** Angemeldet bzw. einsatzbereit */
  bereit: boolean
  /** Verständlicher Grund, warum nicht bereit (in der Sprache der Oberfläche) */
  hinweis: string | null
  /** Gefundene Modelle (lokal) bzw. gewähltes Modell */
  modelle?: string[]
  version?: string | null
}

/** Ein Aufruf in der Form, die jeder Anbieter versteht */
export interface RohAnfrage {
  system: string
  prompt: string
  /** Absolute Pfade zu Bildern (PNG/JPG), nur an Anbieter mit bilderSehen */
  bilder: string[]
  /** JSON-Schema der erwarteten Antwort */
  schema: Record<string, unknown>
  /** „schnell“ für einfache Aufgaben, „stark“ für Planung und Bildbewertung (Anbieter wählt das passende Modell) */
  stufe: 'schnell' | 'stark'
  maxAusgabe: number
}

export interface KiNutzung {
  eingabe: number
  ausgabe: number
}

export interface RohAntwort {
  /** Rohtext der Antwort (bei Anbietern ohne Schema: enthält das JSON) */
  text: string
  /** Bereits strukturiert geliefert (Anbieter mit JSON-Schema), sonst undefined */
  strukturiert?: unknown
  modell: string | null
  nutzung: KiNutzung | null
}

export interface KiAnbieter {
  id: string
  art: KiArt
  faehigkeiten: KiFaehigkeiten
  /** Prüft Installation und Anmeldung, ohne Zugangsdaten oder Tokens zu lesen */
  pruefe(): Promise<KiStatus>
  frage(a: RohAnfrage, ctx?: JobContext<unknown>): Promise<RohAntwort>
  /** Preis des Modells für diese Stufe (nur API-Schlüssel; Abo und lokal kosten nichts extra); null = unbekannt */
  preis?(stufe: RohAnfrage['stufe']): Promise<Preis | null>
}

/** Abo- oder Nutzungslimit erreicht: nach `resetAt` weitermachen (oder auf den nächsten Anbieter ausweichen). */
export class KiLimitFehler extends Error {
  constructor(
    readonly anbieter: string,
    readonly resetAt: Date | null,
    meldung: string
  ) {
    super(meldung)
  }
}

/** Auftrag, unabhängig vom Anbieter beschrieben: Vorlage + Zod-Schema (daraus entsteht das JSON-Schema). */
export interface KiAuftrag<T> {
  /** Name der Vorlage, z. B. „planung-ideen“ (für Protokoll und Kosten-Anzeige) */
  name: string
  system: string
  prompt: string
  bilder?: string[]
  schema: z.ZodType<T>
  stufe?: RohAnfrage['stufe']
  maxAusgabe?: number
  /** Nur Anbieter, die Bilder sehen können, kommen infrage */
  brauchtBilder?: boolean
}

export interface KiErgebnis<T> {
  daten: T
  anbieter: string
  modell: string | null
  nutzung: KiNutzung | null
  kostenUsd: number | null
  /** Wie viele Reparaturrunden nötig waren (0 = sofort gültig) */
  reparaturen: number
}
