// Herkunft: MoinStudio src/shared/effekt-text.ts (MIT), übersetzbar: Oberfläche und Hauptprozess geben ihr t() mit.
import type { SchnittEffekt } from './schnitt'
import type { Schluessel, Werte } from './i18n'

export type Uebersetzer = (schluessel: Schluessel, werte?: Werte) => string

const zahl = (x: unknown): string => (typeof x === 'number' ? String(Math.round(x * 100) / 100) : '')

/** Effekt in einfachen Worten */
export function effektText(e: SchnittEffekt, t: Uebersetzer): string {
  switch (e.art) {
    case 'tempo':
      return t((e['faktor'] as number) < 1 ? 'schnitt.eff.zeitlupe' : 'schnitt.eff.zeitraffer', { faktor: zahl(e['faktor']) })
    case 'einfrieren':
      return t('schnitt.eff.einfrieren', { dauer: zahl(e['dauer']) })
    case 'zoom':
      return t('schnitt.eff.zoom', { faktor: zahl(e['faktor']) })
    case 'farbe': {
      const teile = [e['schwarzweiss'] ? t('schnitt.eff.schwarzweiss') : '', typeof e['ton'] === 'string' ? e['ton'] : '', e['saettigung'] !== undefined ? `${t('schnitt.eff.saettigung')} ${zahl(e['saettigung'])}` : '', e['kontrast'] !== undefined ? `${t('schnitt.eff.kontrast')} ${zahl(e['kontrast'])}` : '']
      return t('schnitt.eff.farbe', { was: teile.filter(Boolean).join(', ') || t('schnitt.eff.angepasst') })
    }
    case 'blitz':
      return t(e['farbe'] === 'schwarz' ? 'schnitt.eff.blitzSchwarz' : 'schnitt.eff.blitz')
    case 'uebergang':
      return t(e['farbe'] === 'weiss' ? 'schnitt.eff.blendeWeiss' : 'schnitt.eff.blende')
    case 'abblende':
      return t(e['richtung'] === 'ein' ? 'schnitt.eff.einblenden' : 'schnitt.eff.ausblenden')
    case 'text':
      return t('schnitt.eff.text', { text: String(e['text'] ?? '') })
    case 'geraeusch':
      return t('schnitt.eff.geraeusch', { klang: String(e['klang'] ?? '') })
    case 'lautstaerke':
      return t('schnitt.eff.lautstaerke', { faktor: zahl(e['faktor']) })
    case 'intro': {
      const teile = (e['teile'] as { art: string; text?: string }[] | undefined) ?? []
      const karte = teile.find((x) => x.art === 'karte')
      return t(karte ? 'schnitt.eff.introKarte' : 'schnitt.eff.intro', { anzahl: teile.filter((x) => x.art === 'clip').length, text: karte?.text ?? '' })
    }
    case 'wackeln':
    case 'bild':
    case 'zensur':
      return t(`schnitt.eff.${e.art}` as Schluessel)
    default:
      return e.art
  }
}
