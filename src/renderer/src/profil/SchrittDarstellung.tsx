import { useState } from 'react'
import { neueId, type Darstellung, type DarstellungArt, type Freund } from '@shared/profil'
import { DateiListe, einzelDatei, Feld, type Setzer } from './Bausteine'
import { kontoSetzer } from './SchrittKonten'
import { useProfil } from './useProfil'
import { fehlerText, useT } from '../i18n'

const ARTEN: DarstellungArt[] = ['foto', 'spielavatar', 'modell3d', 'maskottchen', 'keine']

function leer(art: DarstellungArt): Darstellung {
  switch (art) {
    case 'foto':
      return { art, fotos: [] }
    case 'spielavatar':
      return { art, spiel: 'minecraft', skin: null, accountName: null, slim: null, bilder: [], modell: null }
    case 'modell3d':
      return { art, datei: null, format: null }
    case 'maskottchen':
      return { art, datei: null }
    case 'keine':
      return { art }
  }
}

type Avatar = Extract<Darstellung, { art: 'spielavatar' }>

/** Minecraft: Skin hochladen oder per Accountname laden */
function MinecraftSkin({ d, setze, besitzer }: { d: Avatar; setze: (fn: (a: Avatar) => Avatar) => void; besitzer?: string }): React.JSX.Element {
  const t = useT()
  const [name, setName] = useState(d.accountName ?? '')
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const laden = (): void => {
    setLaeuft(true)
    setFehler(null)
    window.cs
      .profilSkinName(name)
      .then((s) => setze((a) => ({ ...a, skin: s.datei, slim: s.slim, accountName: s.name })))
      .catch((e: unknown) => setFehler(fehlerText(e)))
      .finally(() => setLaeuft(false))
  }
  return (
    <>
      <Feld label={t('darst.skinDatei')}>
        <DateiListe dateien={d.skin ? [d.skin] : []} zweck="skin" besitzer={besitzer} setze={einzelDatei((fn) => setze((a) => ({ ...a, skin: fn(a.skin), accountName: fn(a.skin) ? a.accountName : null })))} />
      </Feld>
      <Feld label={t('darst.skinName')}>
        <div className="row" style={{ marginTop: 0 }}>
          <input className="input" value={name} placeholder={t('darst.skinBeispiel')} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && laden()} />
          <button type="button" className="btn" disabled={laeuft || name.trim().length < 3} onClick={laden}>
            {t('darst.skinLaden')}
          </button>
        </div>
        {fehler && <p className="warn small">{fehler}</p>}
      </Feld>
      <label className="switch">
        <input type="checkbox" checked={d.slim === true} onChange={(e) => setze((a) => ({ ...a, slim: e.target.checked }))} />
        <span>{t('darst.slim')}</span>
      </label>
    </>
  )
}

/** Mehrfachauswahl der Darstellungsarten mit den passenden Eingaben */
export function DarstellungEditor({ liste, setze, besitzer }: { liste: Darstellung[]; setze: Setzer<Darstellung[]>; besitzer?: string }): React.JSX.Element {
  const t = useT()
  const hat = (art: DarstellungArt): boolean => liste.some((d) => d.art === art)
  const umschalten = (art: DarstellungArt): void =>
    setze((alt) => {
      if (alt.some((d) => d.art === art)) return alt.filter((d) => d.art !== art)
      // „Keine Person“ schließt die anderen aus und umgekehrt
      if (art === 'keine') return [leer('keine')]
      return [...alt.filter((d) => d.art !== 'keine'), leer(art)]
    })
  /** Änderung an einer Art, immer auf dem aktuellen Stand */
  const art = <A extends DarstellungArt>(a: A) => (fn: (d: Extract<Darstellung, { art: A }>) => Darstellung) =>
    setze((alt) => alt.map((d) => (d.art === a ? fn(d as Extract<Darstellung, { art: A }>) : d)))
  return (
    <div className="darstellung">
      <div className="chips">
        {ARTEN.map((a) => (
          <button key={a} type="button" className={`chip${hat(a) ? ' on' : ''}`} aria-pressed={hat(a)} onClick={() => umschalten(a)}>
            {t(`darst.${a}`)}
          </button>
        ))}
      </div>
      {liste.filter((d) => d.art !== 'keine').map((d) => (
        <div key={d.art} className="darstellung-details">
          {d.art === 'foto' && (
            <Feld label={t('darst.foto')} hinweis={t('darst.fotoText')}>
              <DateiListe dateien={d.fotos} zweck="foto" besitzer={besitzer} setze={(fn) => art('foto')((x) => ({ ...x, fotos: fn(x.fotos) }))} />
            </Feld>
          )}
          {d.art === 'spielavatar' && (
            <>
              <Feld label={t('darst.spiel')}>
                <span className="segment">
                  <button type="button" className={d.spiel === 'minecraft' ? 'on' : ''} onClick={() => art('spielavatar')((x) => ({ ...x, spiel: 'minecraft' }))}>
                    Minecraft
                  </button>
                  <button type="button" className={d.spiel !== 'minecraft' ? 'on' : ''} onClick={() => art('spielavatar')((x) => ({ ...x, spiel: x.spiel === 'minecraft' ? t('darst.spielAndere') : x.spiel }))}>
                    {t('darst.spielAndere')}
                  </button>
                </span>
              </Feld>
              {d.spiel === 'minecraft' ? (
                <MinecraftSkin d={d} besitzer={besitzer} setze={(fn) => art('spielavatar')(fn)} />
              ) : (
                <>
                  <Feld label={t('darst.spielName')}>
                    <input className="input" value={d.spiel} placeholder={t('darst.spielBeispiel')} onChange={(e) => art('spielavatar')((x) => ({ ...x, spiel: e.target.value || t('darst.spielAndere') }))} />
                  </Feld>
                  <Feld label={t('darst.bilder')}>
                    <DateiListe dateien={d.bilder} zweck="bilder" besitzer={besitzer} setze={(fn) => art('spielavatar')((x) => ({ ...x, bilder: fn(x.bilder) }))} />
                  </Feld>
                  <Feld label={t('darst.modell')}>
                    <DateiListe dateien={d.modell ? [d.modell] : []} zweck="modell" besitzer={besitzer} setze={einzelDatei((fn) => art('spielavatar')((x) => ({ ...x, modell: fn(x.modell) })))} />
                  </Feld>
                </>
              )}
            </>
          )}
          {d.art === 'modell3d' && (
            <Feld label={t('darst.modell')}>
              <DateiListe
                dateien={d.datei ? [d.datei] : []}
                zweck="modell"
                besitzer={besitzer}
                setze={einzelDatei((fn) =>
                  art('modell3d')((x) => {
                    const datei = fn(x.datei)
                    const endung = datei?.split('.').pop()?.toLowerCase()
                    return { ...x, datei, format: endung === 'vrm' ? 'vrm' : endung === 'fbx' ? 'fbx' : datei ? 'glb' : null }
                  })
                )}
              />
            </Feld>
          )}
          {d.art === 'maskottchen' && (
            <Feld label={t('darst.maskottchen')}>
              <DateiListe dateien={d.datei ? [d.datei] : []} zweck="maskottchen" besitzer={besitzer} setze={einzelDatei((fn) => art('maskottchen')((x) => ({ ...x, datei: fn(x.datei) })))} />
            </Feld>
          )}
        </div>
      ))}
    </div>
  )
}

export function DarstellungSchritt(): React.JSX.Element | null {
  const t = useT()
  const { profil, aendere } = useProfil()
  if (!profil) return null
  const freund = (id: string, fn: (f: Freund) => Freund): void => aendere((p) => ({ ...p, freunde: p.freunde.map((x) => (x.id === id ? fn(x) : x)) }))
  return (
    <div className="setup-text">
      <h2>{t('darst.titel')}</h2>
      <p className="muted">{t('darst.text')}</p>
      {profil.konten.length === 0 && <p className="warn">{t('darst.ohneKanal')}</p>}
      {profil.konten.map((k) => {
        const setzeKonto = kontoSetzer(aendere, k.id)
        return (
          <section key={k.id} className="card">
            <div className="card-head">
              <h2>{t('darst.fuerKanal', { kanal: k.name.trim() || t('konten.unbenannt') })}</h2>
              {profil.konten.length > 1 && k.darstellung.length > 0 && (
                <button
                  type="button"
                  className="btn small"
                  onClick={() => aendere((p) => ({ ...p, konten: p.konten.map((x) => ({ ...x, darstellung: structuredClone(p.konten.find((y) => y.id === k.id)?.darstellung ?? []) })) }))}
                >
                  {t('darst.fuerAlle')}
                </button>
              )}
            </div>
            <DarstellungEditor liste={k.darstellung} setze={(fn) => setzeKonto((alt) => ({ ...alt, darstellung: fn(alt.darstellung) }))} />
          </section>
        )
      })}
      <h3>{t('darst.freunde')}</h3>
      <p className="muted small">{t('darst.freundeText')}</p>
      {profil.freunde.map((f) => (
        <section key={f.id} className="card">
          <div className="card-head">
            <input className="input" value={f.name} placeholder={t('darst.freundName')} onChange={(e) => freund(f.id, (x) => ({ ...x, name: e.target.value }))} />
            <button type="button" className="btn small" onClick={() => aendere((p) => ({ ...p, freunde: p.freunde.filter((x) => x.id !== f.id) }))}>
              {t('darst.entfernen')}
            </button>
          </div>
          <DarstellungEditor liste={f.darstellung} besitzer={f.id} setze={(fn) => freund(f.id, (x) => ({ ...x, darstellung: fn(x.darstellung) }))} />
        </section>
      ))}
      <button type="button" className="btn" onClick={() => aendere((p) => ({ ...p, freunde: [...p.freunde, { id: neueId('freund'), name: '', darstellung: [] }] }))}>
        {t('darst.freundHinzu')}
      </button>
    </div>
  )
}
