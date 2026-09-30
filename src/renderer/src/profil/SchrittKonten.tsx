import { useState } from 'react'
import { FORMATE, neueId, PLATTFORMEN, RICHTUNGEN, ROLLEN, type Konto, type Profil } from '@shared/profil'
import type { Schluessel } from '@shared/i18n'
import { Chips, Feld, FreieEintraege, RhythmusEditor, useSprachName, type Setzer } from './Bausteine'
import { useProfil } from './useProfil'
import { fehlerText, useI18n, useT } from '../i18n'

/** Sprachen, die als Chips vorgeschlagen werden; jede andere lässt sich als Kürzel eingeben */
export const SPRACH_VORSCHLAEGE = ['de', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'tr'] as const

type Person = Profil['person']

export function PersonSchritt(): React.JSX.Element | null {
  const t = useT()
  const sprachName = useSprachName()
  const { profil, aendere } = useProfil()
  if (!profil) return null
  const p = profil.person
  const setzePerson = (fn: (alt: Person) => Person): void => aendere((x) => ({ ...x, person: fn(x.person) }))
  const feld = <K extends keyof Person>(k: K): Setzer<Person[K]> => (fn) => setzePerson((alt) => ({ ...alt, [k]: fn(alt[k]) }))
  const mitglied = (i: number, neu: Partial<Person['mitglieder'][number]>): void =>
    setzePerson((alt) => ({ ...alt, mitglieder: alt.mitglieder.map((m, j) => (j === i ? { ...m, ...neu } : m)) }))
  return (
    <div className="setup-text">
      <h2>{t('person.titel')}</h2>
      <p className="muted">{t('person.text')}</p>
      <Feld label={t('person.name')}>
        <input className="input" value={p.name} placeholder={t('person.namePlatzhalter')} onChange={(e) => setzePerson((alt) => ({ ...alt, name: e.target.value }))} />
      </Feld>
      <Feld label={t('person.sprachen')}>
        <Chips werte={SPRACH_VORSCHLAEGE} gewaehlt={p.sprachen} label={sprachName} setze={feld('sprachen')} />
        <FreieEintraege werte={p.sprachen} ausblenden={SPRACH_VORSCHLAEGE} platzhalter={t('person.spracheHinzu')} umformen={(s) => s.toLowerCase().slice(0, 8)} setze={feld('sprachen')} />
      </Feld>
      <Feld label={t('person.team')}>
        <span className="segment">
          <button type="button" className={p.team === 'allein' ? 'on' : ''} onClick={() => setzePerson((alt) => ({ ...alt, team: 'allein' }))}>
            {t('person.allein')}
          </button>
          <button type="button" className={p.team === 'team' ? 'on' : ''} onClick={() => setzePerson((alt) => ({ ...alt, team: 'team' }))}>
            {t('person.imTeam')}
          </button>
        </span>
      </Feld>
      {p.team === 'team' && (
        <Feld label={t('person.mitglieder')}>
          {p.mitglieder.map((m, i) => (
            <div key={i} className="mitglied">
              <input className="input" value={m.name} placeholder={t('person.mitgliedName')} onChange={(e) => mitglied(i, { name: e.target.value })} />
              <Chips
                werte={ROLLEN}
                gewaehlt={m.rollen}
                label={(r) => t(`rolle.${r}`)}
                setze={(fn) => setzePerson((alt) => ({ ...alt, mitglieder: alt.mitglieder.map((x, j) => (j === i ? { ...x, rollen: fn(x.rollen) } : x)) }))}
              />
              <button type="button" className="btn small" onClick={() => setzePerson((alt) => ({ ...alt, mitglieder: alt.mitglieder.filter((_, j) => j !== i) }))}>
                {t('darst.entfernen')}
              </button>
            </div>
          ))}
          <button type="button" className="btn small" onClick={() => setzePerson((alt) => ({ ...alt, mitglieder: [...alt.mitglieder, { name: '', rollen: [] }] }))}>
            {t('person.mitgliedHinzu')}
          </button>
        </Feld>
      )}
    </div>
  )
}

const YOUTUBE = new Set(['youtube', 'youtube-shorts'])

/** Öffentliche Metadaten eines Kontos: Zustimmung, Abruf, Ergebnis */
function Metadaten({ konto, setzeKonto }: { konto: Konto; setzeKonto: (fn: (k: Konto) => Konto) => void }): React.JSX.Element | null {
  const { t, locale } = useI18n()
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  if (!konto.link) return null
  if (!YOUTUBE.has(konto.plattform)) return <p className="muted small">{t('meta.nurYoutube')}</p>
  const zustimmung = konto.metadaten?.zustimmung === true
  const abrufen = (): void => {
    setLaeuft(true)
    setFehler(null)
    // Die Zustimmung wird kurz nach dem Anhaken gespeichert; der Hauptprozess prüft sie vor dem Abruf.
    setTimeout(() => {
      window.cs
        .profilMetadaten(konto.id)
        .then((k) => setzeKonto((alt) => ({ ...alt, metadaten: k.metadaten })))
        .catch((e: unknown) => setFehler(fehlerText(e)))
        .finally(() => setLaeuft(false))
    }, 600)
  }
  const m = konto.metadaten
  return (
    <div className="metadaten">
      <label className="switch">
        <input
          type="checkbox"
          checked={zustimmung}
          onChange={(e) => {
            const an = e.target.checked
            setzeKonto((alt) => ({ ...alt, metadaten: { zustimmung: an, abgerufen: an ? (alt.metadaten?.abgerufen ?? null) : null, videos: an ? (alt.metadaten?.videos ?? []) : [] } }))
          }}
        />
        <span className="small">{t('meta.zustimmung')}</span>
      </label>
      {zustimmung && (
        <button type="button" className="btn small" disabled={laeuft} onClick={abrufen}>
          {laeuft ? t('meta.ruftAb') : t('meta.abrufen')}
        </button>
      )}
      {fehler && <p className="warn small">{fehler}</p>}
      {m?.abgerufen && m.videos.length > 0 && (
        <>
          <p className="muted small">{t('meta.frist')}</p>
          <p className="muted small">{t('meta.ergebnis', { anzahl: m.videos.length, datum: new Date(m.abgerufen).toLocaleDateString(locale) })}</p>
          <div className="meta-videos">
            {m.videos.slice(0, 6).map((v) => (
              <figure key={v.id}>
                <img src={v.thumbnail} alt={v.titel} loading="lazy" />
                <figcaption className="small">{v.titel}</figcaption>
              </figure>
            ))}
          </div>
          {m.videos.every((v) => v.dauer === null) && <p className="muted small">{t('meta.ohneLaenge')}</p>}
          <p className="muted small">
            {t('meta.quelle')}{' '}
            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">
              {t('meta.youtubeBedingungen')}
            </a>
          </p>
          <button type="button" className="btn small" onClick={() => setzeKonto((alt) => ({ ...alt, metadaten: { zustimmung: false, abgerufen: null, videos: [] } }))}>
            {t('meta.loeschen')}
          </button>
        </>
      )}
    </div>
  )
}

/** Setzer für eine Liste im Konto, immer auf dem aktuellen Stand */
export function kontoSetzer(aendere: (fn: (p: Profil) => Profil) => void, id: string): (fn: (k: Konto) => Konto) => void {
  return (fn) => aendere((p) => ({ ...p, konten: p.konten.map((k) => (k.id === id ? fn(k) : k)) }))
}

function KontoKarte({ konto, sprachen }: { konto: Konto; sprachen: string[] }): React.JSX.Element {
  const t = useT()
  const sprachName = useSprachName()
  const { aendere } = useProfil()
  const setzeKonto = kontoSetzer(aendere, konto.id)
  const feld = <K extends keyof Konto>(k: K): Setzer<Konto[K]> => (fn) => setzeKonto((alt) => ({ ...alt, [k]: fn(alt[k]) }))
  const wert = <K extends keyof Konto>(k: K, v: Konto[K]): void => setzeKonto((alt) => ({ ...alt, [k]: v }))
  const entfernen = (): void => aendere((p) => ({ ...p, konten: p.konten.filter((k) => k.id !== konto.id) }))
  const sprachAuswahl = [...new Set([...sprachen, ...SPRACH_VORSCHLAEGE, konto.sprache])]
  return (
    <section className="card konto">
      <div className="card-head">
        <h2>
          {t(`plattform.${konto.plattform}` as Schluessel)} · {konto.name.trim() || t('konten.unbenannt')}
        </h2>
        <button type="button" className="btn small" onClick={entfernen}>
          {t('konten.entfernen')}
        </button>
      </div>
      <div className="konto-felder">
        <Feld label={t('konten.plattform')}>
          <select className="input" value={konto.plattform} onChange={(e) => wert('plattform', e.target.value as Konto['plattform'])}>
            {PLATTFORMEN.map((p) => (
              <option key={p} value={p}>
                {t(`plattform.${p}` as Schluessel)}
              </option>
            ))}
          </select>
        </Feld>
        <Feld label={t('konten.name')}>
          <input className="input" value={konto.name} placeholder={t('konten.namePlatzhalter')} onChange={(e) => wert('name', e.target.value)} />
        </Feld>
        <Feld label={t('konten.sprache')}>
          <select className="input" value={konto.sprache} onChange={(e) => wert('sprache', e.target.value)}>
            {sprachAuswahl.map((s) => (
              <option key={s} value={s}>
                {sprachName(s)}
              </option>
            ))}
          </select>
        </Feld>
      </div>
      <Feld label={t('konten.richtungen')}>
        <Chips werte={RICHTUNGEN} gewaehlt={konto.richtungen} label={(r) => t(`richtung.${r}`)} setze={feld('richtungen')} />
        <FreieEintraege werte={konto.richtungen} ausblenden={RICHTUNGEN} platzhalter={t('konten.richtungFrei')} setze={feld('richtungen')} />
      </Feld>
      {konto.richtungen.includes('gaming') && (
        <Feld label={t('konten.spiele')}>
          <FreieEintraege werte={konto.spiele} platzhalter={t('konten.spielHinzu')} setze={feld('spiele')} />
        </Feld>
      )}
      <Feld label={t('konten.formate')}>
        <Chips werte={FORMATE} gewaehlt={konto.formate} label={(f) => t(`format.${f}`)} setze={(fn) => setzeKonto((alt) => ({ ...alt, formate: fn(alt.formate) as Konto['formate'] }))} />
      </Feld>
      <Feld label={t('konten.rhythmus')}>
        <RhythmusEditor slots={konto.rhythmus} setze={feld('rhythmus')} />
      </Feld>
      <Feld label={t('konten.link')}>
        <input className="input" value={konto.link ?? ''} placeholder={t('konten.linkBeispiel')} onChange={(e) => wert('link', e.target.value.trim() || null)} />
      </Feld>
      <Metadaten konto={konto} setzeKonto={setzeKonto} />
    </section>
  )
}

/** Leeres Konto mit Standards */
export function neuesKonto(sprache: string): Konto {
  return {
    id: neueId('konto'),
    plattform: 'youtube',
    name: '',
    sprache,
    richtungen: [],
    spiele: [],
    formate: [],
    rhythmus: [],
    link: null,
    metadaten: null,
    darstellung: [],
    vorbildKanaele: [],
    vorbildBilder: []
  }
}

export function KontenSchritt(): React.JSX.Element | null {
  const { t, sprache } = useI18n()
  const { profil, aendere } = useProfil()
  if (!profil) return null
  return (
    <div className="setup-text">
      <h2>{t('konten.titel')}</h2>
      <p className="muted">{t('konten.text')}</p>
      {profil.konten.length === 0 && <p className="muted">{t('konten.keine')}</p>}
      <div className="konten">
        {profil.konten.map((k) => (
          <KontoKarte key={k.id} konto={k} sprachen={profil.person.sprachen} />
        ))}
      </div>
      <button type="button" className="btn primary" onClick={() => aendere((p) => ({ ...p, konten: [...p.konten, neuesKonto(p.person.sprachen[0] ?? sprache)] }))}>
        {t('konten.hinzu')}
      </button>
    </div>
  )
}
