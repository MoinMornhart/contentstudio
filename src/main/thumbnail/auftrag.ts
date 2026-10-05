import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import type { Sprache } from '@shared/i18n'
import type { Darstellung, Konto, Profil } from '@shared/profil'
import type { Engine, ThumbStart } from '@shared/thumbnail'
import { analysiere } from '../bild/analyse'
import { liesBild } from '../bild/rohbild'
import type { ProfilStore } from '../profil/store'
import { skinAusName } from '../profil/skinname'
import { t } from '../i18n'
import { logoFuerAuftrag } from '../logo/bibliothek'
import { beispielFuer, type VorbildStore } from './vorbilder'
import { stilKontext, type AuftragsVorbildDaten } from './kontext'
import type { BeispielStilbuch } from '@shared/thumbnail'
import type { FigurDaten, ThumbPayload } from './typen'
import type { ThumbUmgebung } from './umgebung'

/**
 * Baut aus dem Start in der Oberfläche und dem Creator-Profil einen vollständigen Auftrag (ROADMAP 4.6/4.7): welche
 * Engine, welche Personen mit welchen Dateien, Stilbuch und Vorbilder des Kanals, Marke (Schrift, Logo, Farben).
 */

export class AuftragsFehler extends Error {}

const ist3d = (d: Darstellung): boolean => (d.art === 'spielavatar' && !!d.modell) || d.art === 'modell3d'
const istMinecraft = (d: Darstellung): d is Extract<Darstellung, { art: 'spielavatar' }> => d.art === 'spielavatar' && d.spiel.toLowerCase() === 'minecraft'

/** Engine aus der Darstellung des Kontos: die erste passende in der Reihenfolge des Creators */
export function engineFuer(darstellung: Darstellung[]): Engine {
  for (const d of darstellung) {
    if (d.art === 'spielavatar' && d.spiel.toLowerCase() === 'minecraft') return 'minecraft'
    if (ist3d(d)) return 'modell3d'
    if (d.art === 'foto' || d.art === 'maskottchen' || (d.art === 'spielavatar' && d.bilder.length)) return 'foto'
    if (d.art === 'keine') return 'grafik'
  }
  return 'grafik'
}

/** Ob eine Darstellung für die Engine taugt */
function passt(d: Darstellung, e: Engine): boolean {
  if (e === 'minecraft') return istMinecraft(d) && (!!d.skin || !!d.accountName)
  if (e === 'modell3d') return (d.art === 'modell3d' && !!d.datei) || (d.art === 'spielavatar' && !!d.modell)
  if (e === 'foto') return (d.art === 'foto' && d.fotos.length > 0) || (d.art === 'maskottchen' && !!d.datei) || (d.art === 'spielavatar' && d.bilder.length > 0)
  return false
}

async function figur(store: ProfilStore, id: string, name: string, rolle: FigurDaten['rolle'], darstellung: Darstellung[], engine: Engine, aendere: (skin: string, slim: boolean) => Promise<void>): Promise<FigurDaten | null> {
  const d = darstellung.find((x) => passt(x, engine))
  if (!d) return null
  const abs = (rel: string): Promise<string> => store.absolut(rel)
  const f: FigurDaten = { id, name, rolle, skin: null, slim: null, fotos: [], mensch: false, modell: null }
  if (d.art === 'spielavatar' && engine === 'minecraft') {
    if (!d.skin && d.accountName) {
      // Skin per Accountname: öffentlich bei Mojang laden und im Profil merken
      const s = await skinAusName(d.accountName)
      const datei = await store.bytesAblegen(s.png, 'avatare/skins', `${s.name}.png`)
      await aendere(datei, s.slim)
      f.skin = await abs(datei)
      f.slim = s.slim
    } else if (d.skin) {
      f.skin = await abs(d.skin)
      f.slim = d.slim
    }
  } else if (d.art === 'spielavatar' && engine === 'modell3d') f.modell = d.modell ? await abs(d.modell) : null
  else if (d.art === 'modell3d') f.modell = d.datei ? await abs(d.datei) : null
  else if (d.art === 'foto') {
    f.fotos = await Promise.all(d.fotos.map(abs))
    f.mensch = true
  } else if (d.art === 'maskottchen' && d.datei) f.fotos = [await abs(d.datei)]
  else if (d.art === 'spielavatar') f.fotos = await Promise.all(d.bilder.map(abs))
  return f
}

/** Schrift der Marke: eigene Datei oder eine installierte Windows-Schrift gleichen Namens */
export function schriftPfad(name: string | null, datei: string | null, fonts = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'Fonts')): string | null {
  if (datei && existsSync(datei)) return datei
  if (!name) return null
  const stamm = name.toLowerCase().replace(/[^a-z0-9]+/g, '')
  for (const endung of ['.ttf', '.otf']) for (const k of [stamm, `${stamm}bd`, `${stamm}-bold`]) if (existsSync(join(fonts, `${k}${endung}`))) return join(fonts, `${k}${endung}`)
  return null
}

export interface AuftragsKontext {
  store: ProfilStore
  vorbilder: VorbildStore
  beispiele: BeispielStilbuch[]
  umgebung: ThumbUmgebung
  sprache: Sprache
  ausgabe: string
}

export async function baueAuftrag(start: ThumbStart, k: AuftragsKontext): Promise<ThumbPayload> {
  const profil: Profil = await k.store.laden()
  const konto: Konto | undefined = profil.konten.find((x) => x.id === start.kontoId)
  if (!konto) throw new AuftragsFehler(t('thumb.auftrag.keinKonto'))
  const engine = start.engine ?? engineFuer(konto.darstellung)
  if ((start.art === 'reaktion' || start.art === 'vorlage') && !start.quelle) throw new AuftragsFehler(t('thumb.auftrag.keineQuelle'))
  if (start.art === 'frei' && start.beschreibung.trim().length < 3) throw new AuftragsFehler(t('thumb.auftrag.beschreibung'))

  const merkeSkin = (wo: { konto?: string; freund?: string }) => async (skin: string, slim: boolean): Promise<void> => {
    await k.store.aendern((p) => {
      const setze = (ds: Darstellung[]): Darstellung[] => ds.map((d) => (d.art === 'spielavatar' && istMinecraft(d) && !d.skin ? { ...d, skin, slim } : d))
      return {
        ...p,
        konten: p.konten.map((x) => (x.id === wo.konto ? { ...x, darstellung: setze(x.darstellung) } : x)),
        freunde: p.freunde.map((x) => (x.id === wo.freund ? { ...x, darstellung: setze(x.darstellung) } : x))
      }
    })
  }
  const figuren: FigurDaten[] = []
  if (engine !== 'grafik') {
    const ich = await figur(k.store, 'ich', `${profil.person.name || konto.name || t('thumb.auftrag.ich')}${konto.name ? ` (${konto.name})` : ''}`, 'ich', konto.darstellung, engine, merkeSkin({ konto: konto.id }))
    if (!ich) throw new AuftragsFehler(t('thumb.auftrag.keineDarstellung', { engine: t(`thumb.engine.${engine}`) }))
    figuren.push(ich)
    for (const fid of start.freunde) {
      const fr = profil.freunde.find((x) => x.id === fid)
      if (!fr) continue
      const id = fr.name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16) || `freund${figuren.length}`
      const f = await figur(k.store, figuren.some((x) => x.id === id) ? `${id}${figuren.length}` : id, fr.name || id, 'freund', fr.darstellung, engine === 'modell3d' ? 'foto' : engine, merkeSkin({ freund: fr.id }))
      if (f) figuren.push(f)
    }
  }

  const abs = async (x: string): Promise<string> => (isAbsolute(x) ? x : k.store.absolut(x))
  const auftrag: AuftragsVorbildDaten[] = []
  for (const a of start.auftragsVorbilder) {
    const pfad = await abs(a.datei)
    auftrag.push({ ...a, pfad, beschreibung: '', lokal: analysiere(await liesBild(pfad)), seite: null })
  }
  const vorbilder = await k.vorbilder.liste(konto.id)
  const beispiel = beispielFuer(konto, k.beispiele)
  const stilbuch = (await k.vorbilder.stilbuch(konto.id)) ?? (await k.vorbilder.erstelleStilbuch(konto.id, { ki: null, beispiel }))
  // Logo aus der Bibliothek: gewähltes, Standard-Logo des Kontos oder das erste der Marke (aus MoinStudio v0.38.0)
  const logoWahl = await logoFuerAuftrag(k.store, start.logo, konto.id).catch(() => null)
  const schrift = schriftPfad(profil.marke.schrift?.name ?? null, profil.marke.schrift?.datei ? await abs(profil.marke.schrift.datei) : null)

  return {
    start,
    engine,
    kanal: { id: konto.id, name: konto.name || t('konten.unbenannt'), plattform: t(`plattform.${konto.plattform}`), richtungen: konto.richtungen, sprache: konto.sprache },
    figuren,
    stil: stilKontext({ vorbilder, stilbuch, beispiel, auftrag, farben: profil.marke.farben }),
    marke: { schrift, logo: logoWahl?.datei ?? null, farben: profil.marke.farben, ...(logoWahl ? { logoPlatz: { position: logoWahl.position, groesse: logoWahl.groesse } } : {}) },
    hintergrund: start.hintergrund ? await abs(start.hintergrund) : null,
    umgebung: { ...k.umgebung, mojangErlaubt: profil.einstellungen.minecraftBesitz },
    ausgabe: k.ausgabe,
    sprache: k.sprache
  }
}
