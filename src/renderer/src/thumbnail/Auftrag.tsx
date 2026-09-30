import { useState } from 'react'
import type { Profil } from '@shared/profil'
import { ENGINES, THUMB_ARTEN, UEBERNEHMEN, type AuftragsVorbild, type Engine, type ThumbArt } from '@shared/thumbnail'
import { Chips, Feld } from '../profil/Bausteine'
import { fehlerText, useT } from '../i18n'

const dateiName = (p: string): string => p.split(/[\\/]/).pop() ?? p

export interface AuftragsVorschlag {
  beschreibung?: string
  hintergrund?: string
  freunde?: string[]
}

/**
 * Neuer Auftrag (ROADMAP 4.6, 4.10): Beschreibung, Kanal, Freunde, Art (frei, Reaction, Vorlage, aus dem Video),
 * Vorbilder nur für diesen Auftrag, eigenes Hintergrundbild. Die Engine wählt die App aus der Darstellung des Kanals.
 */
export function AuftragsKarte({
  profil,
  kontoId,
  setzeKonto,
  ki,
  vorschlag,
  gestartet
}: {
  profil: Profil
  kontoId: string
  setzeKonto: (id: string) => void
  ki: { ki: boolean; bildKi: boolean }
  vorschlag: AuftragsVorschlag | null
  gestartet: (jobId: string) => void
}): React.JSX.Element {
  const t = useT()
  const [art, setArt] = useState<ThumbArt>('frei')
  const [beschreibung, setBeschreibung] = useState('')
  const [freunde, setFreunde] = useState<string[]>([])
  const [anzahl, setAnzahl] = useState(3)
  const [engine, setEngine] = useState<Engine | 'auto'>('auto')
  const [quelle, setQuelle] = useState<string | null>(null)
  const [hintergrund, setHintergrund] = useState<string | null>(null)
  const [gefuehl, setGefuehl] = useState('')
  const [wort, setWort] = useState('')
  const [titel, setTitel] = useState('')
  const [vorbilder, setVorbilder] = useState<AuftragsVorbild[]>([])
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [letzterVorschlag, setLetzterVorschlag] = useState<AuftragsVorschlag | null>(null)

  // Vorschlag aus „Aus dem Video“ übernehmen (Idee oder Standbild als Hintergrund)
  if (vorschlag && vorschlag !== letzterVorschlag) {
    setLetzterVorschlag(vorschlag)
    setArt('frei')
    if (vorschlag.beschreibung) setBeschreibung(vorschlag.beschreibung)
    if (vorschlag.hintergrund) setHintergrund(vorschlag.hintergrund)
    if (vorschlag.freunde) setFreunde(profil.freunde.filter((f) => vorschlag.freunde!.includes(f.name)).map((f) => f.id))
  }

  const waehle = async (zweck: 'bild' | 'video', setze: (p: string) => void): Promise<void> => {
    const p = await window.cs.thumbDatei(zweck)
    if (p) setze(p)
  }

  const starten = (): void => {
    setFehler(null)
    setLaeuft(true)
    const lauf =
      art === 'video'
        ? window.cs.thumbVideo(quelle ?? '', kontoId, titel || undefined)
        : window.cs.thumbStart({
            art,
            kontoId,
            beschreibung,
            freunde,
            anzahl,
            engine: engine === 'auto' ? null : engine,
            auftragsVorbilder: vorbilder,
            quelle,
            hintergrund,
            gefuehl: gefuehl || null,
            wort: wort || null
          })
    lauf
      .then(gestartet)
      .catch((e: unknown) => setFehler(fehlerText(e)))
      .finally(() => setLaeuft(false))
  }

  const braucheQuelle = art !== 'frei'
  const bereit = !!kontoId && (!braucheQuelle || !!quelle) && (art !== 'frei' || beschreibung.trim().length >= 3)

  return (
    <section className="card auftrag">
      <div className="card-head">
        <h2>{t('thumb.neu.titel')}</h2>
      </div>
      {!ki.ki && <p className="warn small">{t('thumb.neu.ohneKi')}</p>}
      {ki.ki && !ki.bildKi && <p className="muted small">{t('thumb.neu.ohneBildKi')}</p>}
      <div className="konto-felder">
        <Feld label={t('thumb.neu.kanal')}>
          <select className="input" value={kontoId} onChange={(e) => setzeKonto(e.target.value)}>
            {profil.konten.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name || t('konten.unbenannt')}
              </option>
            ))}
          </select>
        </Feld>
        <Feld label={t('thumb.neu.engine')}>
          <select className="input" value={engine} onChange={(e) => setEngine(e.target.value as Engine | 'auto')}>
            <option value="auto">{t('thumb.neu.engineAuto')}</option>
            {ENGINES.map((x) => (
              <option key={x} value={x}>
                {t(`thumb.engine.${x}`)}
              </option>
            ))}
          </select>
        </Feld>
      </div>
      <span className="segment">
        {THUMB_ARTEN.map((a) => (
          <button key={a} type="button" className={art === a ? 'on' : ''} onClick={() => setArt(a)}>
            {t(`thumb.art.${a}`)}
          </button>
        ))}
      </span>
      <p className="muted small">{t(`thumb.art.${art}.text`)}</p>

      {art !== 'video' && (
        <Feld label={art === 'frei' ? t('thumb.neu.beschreibung') : t('thumb.neu.wunsch')}>
          <textarea className="input" rows={3} value={beschreibung} placeholder={t('thumb.neu.beschreibungPlatzhalter')} onChange={(e) => setBeschreibung(e.target.value)} />
        </Feld>
      )}
      {braucheQuelle && (
        <Feld label={t(`thumb.quelle.${art}`)}>
          <div className="row">
            <button type="button" className="btn small" onClick={() => void waehle(art === 'video' ? 'video' : 'bild', setQuelle)}>
              {t('thumb.neu.waehlen')}
            </button>
            {quelle && <span className="path">{dateiName(quelle)}</span>}
          </div>
        </Feld>
      )}
      {art === 'reaktion' && (
        <div className="konto-felder">
          <Feld label={t('thumb.neu.gefuehl')}>
            <input className="input" value={gefuehl} placeholder={t('thumb.neu.gefuehlPlatzhalter')} onChange={(e) => setGefuehl(e.target.value)} />
          </Feld>
          <Feld label={t('thumb.neu.wort')}>
            <input className="input" value={wort} maxLength={12} onChange={(e) => setWort(e.target.value)} />
          </Feld>
        </div>
      )}
      {art === 'video' && (
        <Feld label={t('thumb.neu.videotitel')}>
          <input className="input" value={titel} onChange={(e) => setTitel(e.target.value)} />
        </Feld>
      )}
      {art !== 'video' && profil.freunde.length > 0 && (
        <Feld label={t('thumb.neu.freunde')}>
          <Chips werte={profil.freunde.map((f) => f.id)} gewaehlt={freunde} label={(id) => profil.freunde.find((f) => f.id === id)?.name || id} setze={(fn) => setFreunde(fn)} />
        </Feld>
      )}
      {art === 'frei' && (
        <>
          <div className="konto-felder">
            <Feld label={t('thumb.neu.anzahl')}>
              <select className="input" value={anzahl} onChange={(e) => setAnzahl(Number(e.target.value))}>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Feld>
            <Feld label={t('thumb.neu.hintergrund')} hinweis={t('thumb.neu.hintergrundHinweis')}>
              <div className="row">
                <button type="button" className="btn small" onClick={() => void waehle('bild', setHintergrund)}>
                  {t('thumb.neu.waehlen')}
                </button>
                {hintergrund && (
                  <>
                    <span className="path">{dateiName(hintergrund)}</span>
                    <button type="button" className="icon-btn" onClick={() => setHintergrund(null)}>
                      ✕
                    </button>
                  </>
                )}
              </div>
            </Feld>
          </div>
          <Feld label={t('thumb.neu.auftragsVorbilder')} hinweis={t('thumb.neu.auftragsVorbilderHinweis')}>
            {vorbilder.map((v, i) => (
              <div key={v.datei} className="auftrags-vorbild">
                <span className="path">{dateiName(v.datei)}</span>
                <Chips
                  werte={UEBERNEHMEN}
                  gewaehlt={v.uebernehmen}
                  label={(u) => t(`thumb.uebernehmen.${u}`)}
                  setze={(fn) => setVorbilder((alt) => alt.map((x, j) => (j === i ? { ...x, uebernehmen: fn(x.uebernehmen) as AuftragsVorbild['uebernehmen'] } : x)))}
                />
                <input className="input" value={v.hinweis} placeholder={t('thumb.neu.hinweisPlatzhalter')} onChange={(e) => setVorbilder((alt) => alt.map((x, j) => (j === i ? { ...x, hinweis: e.target.value } : x)))} />
                <button type="button" className="icon-btn" onClick={() => setVorbilder((alt) => alt.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            ))}
            {vorbilder.length < 3 && (
              <button type="button" className="btn small" onClick={() => void waehle('bild', (datei) => setVorbilder((alt) => [...alt, { datei, uebernehmen: ['farben'], hinweis: '' }]))}>
                {t('thumb.neu.vorbildDazu')}
              </button>
            )}
          </Feld>
        </>
      )}
      {fehler && <p className="warn small">{fehler}</p>}
      <button type="button" className="btn primary" disabled={!bereit || laeuft || vorbilder.some((v) => !v.uebernehmen.length)} onClick={starten}>
        {art === 'video' ? t('thumb.neu.videoStarten') : t('thumb.neu.starten')}
      </button>
    </section>
  )
}
