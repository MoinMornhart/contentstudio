import type { Profil } from '@shared/profil'
import { Chips, DateiListe, einzelDatei, FarbListe, Feld, FreieEintraege } from './Bausteine'
import { kontoSetzer } from './SchrittKonten'
import { useProfil } from './useProfil'
import { useT } from '../i18n'

export function VorbilderSchritt(): React.JSX.Element | null {
  const t = useT()
  const { profil, aendere } = useProfil()
  if (!profil) return null
  return (
    <div className="setup-text">
      <h2>{t('vorb.titel')}</h2>
      <p className="muted">{t('vorb.text')}</p>
      {profil.konten.length === 0 && <p className="warn">{t('darst.ohneKanal')}</p>}
      {profil.konten.map((k) => (
        <section key={k.id} className="card">
          <div className="card-head">
            <h2>{t('darst.fuerKanal', { kanal: k.name.trim() || t('konten.unbenannt') })}</h2>
            {k.vorbildBilder.length > 0 && <span className="badge">{t('vorb.anzahl', { anzahl: k.vorbildBilder.length })}</span>}
          </div>
          <Feld label={t('vorb.kanaele')}>
            <FreieEintraege werte={k.vorbildKanaele} platzhalter={t('vorb.kanalHinzu')} setze={(fn) => kontoSetzer(aendere, k.id)((x) => ({ ...x, vorbildKanaele: fn(x.vorbildKanaele) }))} />
          </Feld>
          <Feld label={t('vorb.bilder')}>
            <DateiListe dateien={k.vorbildBilder} zweck="vorbild" besitzer={k.id} setze={(fn) => kontoSetzer(aendere, k.id)((x) => ({ ...x, vorbildBilder: fn(x.vorbildBilder) }))} />
          </Feld>
        </section>
      ))}
    </div>
  )
}

/**
 * Schrift-Vorschläge je Richtung (frei nutzbare Schriften; die Dateien liefert ContentStudio mit ROADMAP M4 mit).
 * „Minecraft“ entsteht aus der Spielinstallation des Nutzers, nie aus dem Repo.
 */
const SCHRIFTEN: Record<string, string[]> = {
  gaming: ['Luckiest Guy', 'Bangers', 'Lilita One'],
  streams: ['Bangers', 'Luckiest Guy'],
  reactions: ['Bangers', 'Anton'],
  comedy: ['Bangers', 'Luckiest Guy'],
  kochen: ['Lilita One', 'Fredoka', 'Pacifico'],
  bildung: ['Anton', 'Bebas Neue', 'Montserrat'],
  tech: ['Anton', 'Bebas Neue', 'Montserrat'],
  business: ['Montserrat', 'Bebas Neue'],
  vlog: ['Bebas Neue', 'Anton', 'Pacifico'],
  beauty: ['Playfair Display', 'Pacifico', 'Bebas Neue'],
  fitness: ['Anton', 'Bebas Neue'],
  musik: ['Bebas Neue', 'Monoton'],
  kinder: ['Fredoka', 'Luckiest Guy'],
  podcast: ['Bebas Neue', 'Montserrat']
}
const STANDARD_SCHRIFTEN = ['Anton', 'Bebas Neue', 'Luckiest Guy']

export function schriftVorschlaege(p: Profil): string[] {
  const minecraft =
    p.konten.some((k) => k.spiele.some((s) => /minecraft/i.test(s)) || k.darstellung.some((d) => d.art === 'spielavatar' && d.spiel === 'minecraft')) ||
    p.freunde.some((f) => f.darstellung.some((d) => d.art === 'spielavatar' && d.spiel === 'minecraft'))
  const aus = p.konten.flatMap((k) => k.richtungen.flatMap((r) => SCHRIFTEN[r] ?? []))
  return [...new Set([...(minecraft ? ['Minecraft'] : []), ...aus, ...STANDARD_SCHRIFTEN])].slice(0, 8)
}

export function MarkeSchritt(): React.JSX.Element | null {
  const t = useT()
  const { profil, aendere } = useProfil()
  if (!profil) return null
  const m = profil.marke
  type Marke = Profil['marke']
  const marke = (fn: (alt: Marke) => Marke): void => aendere((p) => ({ ...p, marke: fn(p.marke) }))
  const vorschlaege = schriftVorschlaege(profil)
  const eigene = m.schrift?.datei ? [m.schrift.datei] : []
  return (
    <div className="setup-text">
      <h2>{t('marke.titel')}</h2>
      <p className="muted">{t('marke.text')}</p>
      <Feld label={t('marke.logos')}>
        <DateiListe dateien={m.logos} zweck="logo" setze={(fn) => marke((alt) => ({ ...alt, logos: fn(alt.logos) }))} />
      </Feld>
      <Feld label={t('marke.farben')}>
        <FarbListe farben={m.farben} setze={(fn) => marke((alt) => ({ ...alt, farben: fn(alt.farben) }))} />
      </Feld>
      <Feld label={t('marke.schrift')} hinweis={t('marke.schriftVorschlag')}>
        <Chips
          werte={vorschlaege}
          gewaehlt={m.schrift && !m.schrift.datei ? [m.schrift.name] : []}
          label={(s) => s}
          einzeln
          setze={(fn) =>
            marke((alt) => {
              const neu = fn(alt.schrift && !alt.schrift.datei ? [alt.schrift.name] : [])[0]
              return { ...alt, schrift: neu ? { name: neu, datei: null } : null }
            })
          }
        />
        <DateiListe
          dateien={eigene}
          zweck="schrift"
          knopf={t('marke.schriftEigene')}
          setze={einzelDatei((fn) =>
            marke((alt) => {
              const datei = fn(alt.schrift?.datei ?? null)
              return { ...alt, schrift: datei ? { name: (datei.split('/').pop() ?? datei).replace(/\.(ttf|otf)$/i, ''), datei } : null }
            })
          )}
        />
      </Feld>
      <label className="switch">
        <input type="checkbox" checked={m.wasserzeichen} onChange={(e) => marke((alt) => ({ ...alt, wasserzeichen: e.target.checked }))} />
        <span>{t('marke.wasserzeichen')}</span>
      </label>
    </div>
  )
}
