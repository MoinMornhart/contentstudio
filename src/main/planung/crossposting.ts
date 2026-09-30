import { plusTage, teileTermin, wochentag } from '@shared/kalender'
import { KURZ_PLATTFORMEN, titelFuer, type CrossPost } from '@shared/planung'
import type { Konto, Plattform } from '@shared/profil'
import { PLATTFORM_VORGABEN } from '@shared/schnitt'

/**
 * Cross-Posting (ROADMAP 6.4): Ein Langvideo wird zu einem Plan – das Video selbst am geplanten Termin, danach jeden Tag
 * ein Kurzvideo aus den stärksten Höhepunkten, auf jedem Konto mit Kurzvideos (Shorts, TikTok, Reels). Hat der Creator
 * nur ein YouTube-Konto, kommen die Kurzvideos dort als Shorts. Uhrzeit je Konto aus dessen Rhythmus, sonst die des
 * Langvideos; mehrere Plattformen am selben Tag liegen eine Stunde auseinander, damit sie sich nicht Konkurrenz machen.
 * Die KI ist dafür nicht nötig: Reihenfolge und Abstände folgen festen Regeln, Titel kommen aus den Höhepunkten.
 */

export interface Hoehepunkt {
  start: number
  ende: number
  titel: string
  wert: number
}

/** Ziele für Kurzvideos: Konten mit Kurzvideo-Plattform, sonst YouTube-Konten als Shorts */
export function kurzZiele(konten: Konto[]): { kontoId: string; plattform: Plattform; konto: Konto }[] {
  const kurz = konten.filter((k) => KURZ_PLATTFORMEN.includes(k.plattform)).map((k) => ({ kontoId: k.id, plattform: k.plattform, konto: k }))
  const shorts = konten.filter((k) => k.plattform === 'youtube' && !kurz.some((z) => z.plattform === 'youtube-shorts')).map((k) => ({ kontoId: k.id, plattform: 'youtube-shorts' as Plattform, konto: k }))
  return [...kurz, ...shorts]
}

const plusStunden = (zeit: string, h: number): string => {
  const [s, m] = zeit.split(':').map(Number)
  const neu = Math.min(23, s! + h)
  return `${String(neu).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Uhrzeit eines Kontos an einem Tag: Rhythmus an diesem Wochentag, sonst erster Rhythmus-Termin, sonst Ersatz */
function zeitFuer(k: Konto, tag: string, ersatz: string): string {
  return (k.rhythmus.find((s) => s.tag === wochentag(tag)) ?? k.rhythmus[0])?.zeit ?? ersatz
}

export function crossPlan(o: { lang: { kontoId: string; plattform: Plattform; titel: string; termin: string }; hoehepunkte: Hoehepunkt[]; konten: Konto[]; maxKurz?: number }): CrossPost[] {
  const { tag: start, zeit } = teileTermin(o.lang.termin)
  const plan: CrossPost[] = [{ kontoId: o.lang.kontoId, plattform: o.lang.plattform, art: 'lang', von: null, bis: null, titel: titelFuer(o.lang.titel, o.lang.plattform), termin: o.lang.termin, erledigt: false }]
  const ziele = kurzZiele(o.konten)
  const staerkste = [...o.hoehepunkte].sort((a, b) => b.wert - a.wert || a.start - b.start).slice(0, o.maxKurz ?? 3)
  staerkste.forEach((h, i) => {
    const tag = plusTage(start, i + 1)
    ziele.forEach((z, j) => {
      const max = PLATTFORM_VORGABEN[z.plattform].maxDauer ?? 60
      // Kurzvideos höchstens 60 s (und nie länger, als die Plattform erlaubt)
      const bis = Math.min(h.ende, h.start + Math.min(60, max))
      plan.push({ kontoId: z.kontoId, plattform: z.plattform, art: 'kurz', von: h.start, bis, titel: titelFuer(h.titel, z.plattform), termin: `${tag}T${plusStunden(zeitFuer(z.konto, tag, zeit), j)}`, erledigt: false })
    })
  })
  return plan.sort((a, b) => a.termin.localeCompare(b.termin))
}
