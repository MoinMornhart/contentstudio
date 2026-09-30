import { spracheAusSystem, uebersetze, type Schluessel, type Sprache, type Werte } from '@shared/i18n'

/**
 * Sprache des Hauptprozesses für Meldungen an Nutzer (Aufgaben-Schritte, Fehler). Wird beim Start aus den Einstellungen
 * gesetzt und bei jedem Wechsel in der Oberfläche nachgezogen. Ohne Electron (Tests) gilt die Systemsprache von Node.
 */
let aktiv: Sprache = spracheAusSystem(Intl.DateTimeFormat().resolvedOptions().locale)

export function setzeHauptSprache(sprache: Sprache): void {
  aktiv = sprache
}

export function hauptSprache(): Sprache {
  return aktiv
}

export function t(schluessel: Schluessel, werte?: Werte): string {
  return uebersetze(aktiv, schluessel, werte)
}
