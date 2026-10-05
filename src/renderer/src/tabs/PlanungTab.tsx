// Herkunft: MoinStudio src/renderer/src/tabs/PlanungTab.tsx (MIT), für die Konten des Creator-Profils und übersetzbar.
import { useCallback, useEffect, useState } from 'react'
import { SPALTEN, type PlanungAenderung, type PlanungKarte, type Spalte } from '@shared/planung'
import type { Schluessel } from '@shared/i18n'
import { PageHeader } from '../components/Panel'
import { PlanungKalender, kontoFarbe } from '../planung/Kalender'
import { KartenVideo } from '../planung/KartenVideo'
import { IdeenFinder, TitelVorschlaege } from '../planung/Ki'
import { useProfil } from '../profil/useProfil'
import { fehlerText, useI18n, useT } from '../i18n'

/** „Sa 03.10. 17:00“ in der Sprache der Oberfläche */
function terminText(termin: string, locale: string): string {
  const d = new Date(termin)
  if (Number.isNaN(d.getTime())) return termin
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d)
}

const ueberfaellig = (k: PlanungKarte): boolean => !!k.termin && k.spalte !== 'veroeffentlicht' && new Date(k.termin).getTime() < Date.now()

/** Reihenfolge-Wert für die Anzeige, bevor der Speicher antwortet (gleiche Regel wie im Hauptprozess). */
function ordnungLokal(spalte: PlanungKarte[], index: number): number {
  const vor = spalte[index - 1]?.ordnung
  const nach = spalte[index]?.ordnung
  if (vor === undefined && nach === undefined) return 1
  if (vor === undefined) return nach! - 1
  if (nach === undefined) return vor + 1
  return (vor + nach) / 2
}

export function PlanungTab(): React.JSX.Element {
  const t = useT()
  const { profil } = useProfil()
  const konten = profil?.konten ?? []
  const [karten, setKarten] = useState<PlanungKarte[] | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [kontoWahl, setKonto] = useState<string | null>(null)
  const [offen, setOffen] = useState<string | null>(null)
  const [ansicht, setAnsicht] = useState<'board' | 'kalender'>('board')
  const [ideen, setIdeen] = useState(false)
  const [youtube, setYoutube] = useState<string[]>([])
  const kontoId = kontoWahl && konten.some((k) => k.id === kontoWahl) ? kontoWahl : (konten[0]?.id ?? '')

  const laden = useCallback((): void => {
    window.cs
      .planungKarten()
      .then((k) => {
        setKarten(k)
        setFehler(null)
      })
      .catch((e: unknown) => setFehler(fehlerText(e)))
    void window.cs.uploadVerbindungen().then((v) => setYoutube(v.map((x) => x.kontoId)), () => undefined)
  }, [])
  useEffect(() => {
    laden()
    return window.cs.onPlanungGeaendert(laden)
  }, [laden])

  const ersetze = (k: PlanungKarte): void => setKarten((alt) => (alt ?? []).map((x) => (x.id === k.id ? k : x)))
  const aendern = (id: string, aenderung: PlanungAenderung): void => {
    setKarten((alt) => (alt ?? []).map((x) => (x.id === id ? { ...x, ...aenderung } : x)))
    void window.cs.planungAendern(id, aenderung).then(ersetze).catch(laden)
  }
  const verschieben = (id: string, spalte: Spalte, index: number, ziele: PlanungKarte[]): void => {
    setKarten((alt) => (alt ?? []).map((x) => (x.id === id ? { ...x, spalte, ordnung: ordnungLokal(ziele, index) } : x)))
    void window.cs.planungVerschieben(id, { spalte, index }).then(ersetze).catch(laden)
  }
  const neu = (spalte: Spalte, titel: string): void => {
    void window.cs.planungNeu({ kontoId, titel, spalte }).then((k) => setKarten((alt) => [...(alt ?? []), k]), (e: unknown) => setFehler(fehlerText(e)))
  }
  const loeschen = (id: string): void => {
    setOffen(null)
    setKarten((alt) => (alt ?? []).filter((x) => x.id !== id))
    void window.cs.planungLoeschen(id).catch(laden)
  }

  const imKonto = (karten ?? []).filter((k) => k.kontoId === kontoId)
  const offeneKarte = karten?.find((k) => k.id === offen) ?? null
  const kontoName = (id: string): string => konten.find((k) => k.id === id)?.name.trim() || t('konten.unbenannt')

  return (
    <>
      <PageHeader title={t('tab.planung')} subtitle={t('planung.untertitel')} />
      {konten.length === 0 && <p className="muted">{t('schnitt.neu.keinKonto')}</p>}
      <div className="planung-kopf">
        {ansicht === 'kalender' ? (
          <p className="muted">{t('planung.kal.kopf')}</p>
        ) : (
          <div className="kanal-wahl" role="tablist">
            {konten.map((k) => (
              <button key={k.id} role="tab" aria-selected={kontoId === k.id} className={`kanal-knopf${kontoId === k.id ? ' on' : ''}`} style={kontoFarbe(konten, k.id)} onClick={() => setKonto(k.id)}>
                <strong>
                  <span className="punkt-farbe" /> {kontoName(k.id)}
                </strong>
                <span className="muted small">
                  {t(`plattform.${k.plattform}` as Schluessel)} · {t('planung.offen', { anzahl: (karten ?? []).filter((x) => x.kontoId === k.id && x.spalte !== 'veroeffentlicht').length })}
                </span>
              </button>
            ))}
          </div>
        )}
        <span className="row" style={{ marginTop: 0 }}>
          {ansicht === 'board' && kontoId && (
            <button className={`btn small${ideen ? ' on' : ''}`} onClick={() => setIdeen(!ideen)}>
              {ideen ? t('planung.ideen.aus') : t('planung.ideen.an')}
            </button>
          )}
          <span className="segment">
            <button className={ansicht === 'board' ? 'on' : ''} onClick={() => setAnsicht('board')}>
              {t('planung.board')}
            </button>
            <button className={ansicht === 'kalender' ? 'on' : ''} onClick={() => setAnsicht('kalender')}>
              {t('planung.kalender')}
            </button>
          </span>
        </span>
      </div>
      {ansicht === 'board' && ideen && kontoId && (
        <IdeenFinder key={kontoId} kontoId={kontoId} name={kontoName(kontoId)} uebernehmen={(titel, idee) => window.cs.planungNeu({ kontoId, titel, spalte: 'idee', notizen: idee }).then((k) => setKarten((alt) => [...(alt ?? []), k]))} />
      )}
      {fehler && <p className="warn">{fehler}</p>}
      {karten && ansicht === 'board' && kontoId && <Board karten={imKonto} oeffne={setOffen} verschieben={verschieben} neu={neu} />}
      {karten && ansicht === 'kalender' && <PlanungKalender karten={karten} oeffne={setOffen} aendern={aendern} />}
      {offeneKarte && (
        <KartenDetails
          key={offeneKarte.id}
          karte={offeneKarte}
          youtubeVerbunden={youtube.includes(offeneKarte.kontoId)}
          ersetze={ersetze}
          aendern={(a) => aendern(offeneKarte.id, a)}
          loeschen={() => loeschen(offeneKarte.id)}
          schliessen={() => setOffen(null)}
        />
      )}
    </>
  )
}

function Board({ karten, oeffne, verschieben, neu }: { karten: PlanungKarte[]; oeffne: (id: string) => void; verschieben: (id: string, spalte: Spalte, index: number, ziele: PlanungKarte[]) => void; neu: (spalte: Spalte, titel: string) => void }): React.JSX.Element {
  const t = useT()
  const [ziehe, setZiehe] = useState<string | null>(null)
  const [marke, setMarke] = useState<{ spalte: Spalte; index: number } | null>(null)

  const indexAus = (liste: HTMLElement, y: number): number => {
    const kacheln = [...liste.querySelectorAll<HTMLElement>('[data-karte]')].filter((el) => el.dataset['karte'] !== ziehe)
    const i = kacheln.findIndex((el) => {
      const r = el.getBoundingClientRect()
      return y < r.top + r.height / 2
    })
    return i < 0 ? kacheln.length : i
  }

  return (
    <div className="board-scroll">
      <div className="board">
        {SPALTEN.map((s) => {
          const inSpalte = karten.filter((k) => k.spalte === s).sort((a, b) => a.ordnung - b.ordnung)
          const ohneGezogene = inSpalte.filter((k) => k.id !== ziehe)
          return (
            <div
              key={s}
              className={`board-col${marke?.spalte === s ? ' ziel' : ''}`}
              onDragOver={(e) => {
                if (!ziehe) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                const index = indexAus(e.currentTarget, e.clientY)
                if (marke?.spalte !== s || marke.index !== index) setMarke({ spalte: s, index })
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setMarke(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (ziehe) verschieben(ziehe, s, indexAus(e.currentTarget, e.clientY), ohneGezogene)
                setZiehe(null)
                setMarke(null)
              }}
            >
              <div className="board-col-head">
                <span>{t(`planung.spalte.${s}` as Schluessel)}</span>
                <span className="board-zahl">{inSpalte.length}</span>
              </div>
              <div className="board-karten">
                {inSpalte.map((k) => {
                  const i = ohneGezogene.indexOf(k)
                  return (
                    <div key={k.id} className={k.id === ziehe ? 'weg' : undefined}>
                      {i >= 0 && marke?.spalte === s && marke.index === i && <div className="ablage" />}
                      <Kachel karte={k} oeffne={oeffne} ziehen={setZiehe} />
                    </div>
                  )
                })}
                {marke?.spalte === s && marke.index >= ohneGezogene.length && <div className="ablage" />}
                {s === 'idee' && karten.length === 0 && <p className="muted small">{t('planung.leer')}</p>}
              </div>
              <NeueKarte spalte={s} neu={neu} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Kachel({ karte, oeffne, ziehen }: { karte: PlanungKarte; oeffne: (id: string) => void; ziehen: (id: string | null) => void }): React.JSX.Element {
  const { locale, t } = useI18n()
  const erledigt = karte.checkliste.filter((c) => c.erledigt).length
  const notiz = karte.notizen.split('\n').find((z) => z.trim())
  return (
    <button
      className="kachel"
      data-karte={karte.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', karte.id)
        e.dataTransfer.effectAllowed = 'move'
        // erst nach dem Start ausblenden, sonst bricht Chromium das Ziehen ab
        setTimeout(() => ziehen(karte.id), 0)
      }}
      onDragEnd={() => ziehen(null)}
      onClick={() => oeffne(karte.id)}
    >
      {karte.bildUrl && <img className="kachel-bild" src={karte.bildUrl} alt="" draggable={false} />}
      <span className="kachel-titel">{karte.titel}</span>
      {notiz && <span className="kachel-notiz">{notiz}</span>}
      {(karte.termin || karte.checkliste.length > 0 || karte.crossposting.length > 0 || karte.schnitt || karte.thumbnail?.gewaehlt || karte.texte) && (
        <span className="kachel-fuss">
          {karte.termin && <span className={`termin${ueberfaellig(karte) ? ' spaet' : ''}`}>{terminText(karte.termin, locale)}</span>}
          {karte.checkliste.length > 0 && (
            <span className={`haken${erledigt === karte.checkliste.length ? ' voll' : ''}`}>
              ✓ {erledigt}/{karte.checkliste.length}
            </span>
          )}
          {karte.crossposting.length > 1 && <span className="haken">↗ {karte.crossposting.length - 1}</span>}
          {karte.schnitt && <span className="kachel-chip schnitt" title={t('planung.chip.schnittInfo')}>✂ {t('planung.chip.schnitt')}</span>}
          {karte.thumbnail?.gewaehlt && <span className="kachel-chip bild" title={t('planung.chip.bildInfo')}>🖼 {t('planung.chip.bild')}</span>}
          {karte.texte && <span className="kachel-chip text" title={t('planung.chip.textInfo')}>✎ {t('planung.chip.text')}</span>}
        </span>
      )}
    </button>
  )
}

function NeueKarte({ spalte, neu }: { spalte: Spalte; neu: (spalte: Spalte, titel: string) => void }): React.JSX.Element {
  const t = useT()
  const [offen, setOffen] = useState(spalte === 'idee')
  const [titel, setTitel] = useState('')
  const senden = (): void => {
    if (titel.trim()) neu(spalte, titel.trim())
    setTitel('')
  }
  if (!offen)
    return (
      <button className="neue-karte-knopf" onClick={() => setOffen(true)}>
        {t('planung.karte.plus')}
      </button>
    )
  return (
    <input
      className="input small neue-karte"
      placeholder={spalte === 'idee' ? t('planung.karte.neueIdee') : t('planung.karte.neu')}
      value={titel}
      autoFocus={spalte !== 'idee'}
      onChange={(e) => setTitel(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') senden()
        if (e.key === 'Escape') {
          setTitel('')
          if (spalte !== 'idee') setOffen(false)
        }
      }}
      onBlur={() => {
        senden()
        if (spalte !== 'idee') setOffen(false)
      }}
    />
  )
}

function KartenDetails({
  karte,
  youtubeVerbunden,
  ersetze,
  aendern,
  loeschen,
  schliessen
}: {
  karte: PlanungKarte
  youtubeVerbunden: boolean
  ersetze: (k: PlanungKarte) => void
  aendern: (a: PlanungAenderung) => void
  loeschen: () => void
  schliessen: () => void
}): React.JSX.Element {
  const { t, locale } = useI18n()
  const { profil } = useProfil()
  const [titel, setTitel] = useState(karte.titel)
  const [notizen, setNotizen] = useState(karte.notizen)
  const [punkt, setPunkt] = useState('')
  const [sicher, setSicher] = useState(false)
  // Änderungen von außen (anderes Gerät, MCP-App) übernehmen – React-Muster „Zustand beim Rendern anpassen“
  const [stand, setStand] = useState({ titel: karte.titel, notizen: karte.notizen })
  if (stand.titel !== karte.titel || stand.notizen !== karte.notizen) {
    setStand({ titel: karte.titel, notizen: karte.notizen })
    if (stand.titel !== karte.titel) setTitel(karte.titel)
    if (stand.notizen !== karte.notizen) setNotizen(karte.notizen)
  }
  useEffect(() => {
    const taste = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') schliessen()
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [schliessen])

  const liste = karte.checkliste
  return (
    <div className="details-hinter" onMouseDown={(e) => e.target === e.currentTarget && schliessen()}>
      <aside className="details" aria-label={t('planung.karte.bearbeiten')}>
        <div className="details-kopf">
          <textarea
            className="details-titel"
            rows={2}
            value={titel}
            onChange={(e) => setTitel(e.target.value.replace(/\n/g, ' '))}
            onBlur={() => titel.trim() && titel.trim() !== karte.titel && aendern({ titel: titel.trim() })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                ;(e.target as HTMLTextAreaElement).blur()
              }
            }}
          />
          <button className="icon-btn" aria-label={t('planung.karte.schliessen')} onClick={schliessen}>
            ✕
          </button>
        </div>

        <div className="details-felder">
          <label>
            <span className="muted small">{t('schnitt.neu.konto')}</span>
            <select className="input" value={karte.kontoId} onChange={(e) => aendern({ kontoId: e.target.value })}>
              {(profil?.konten ?? []).map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name.trim() || t('konten.unbenannt')} · {t(`plattform.${k.plattform}` as Schluessel)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted small">{t('planung.karte.stand')}</span>
            <select className="input" value={karte.spalte} onChange={(e) => aendern({ spalte: e.target.value as Spalte })}>
              {SPALTEN.map((s) => (
                <option key={s} value={s}>
                  {t(`planung.spalte.${s}` as Schluessel)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted small">{t('planung.karte.termin')}</span>
            <span className="row" style={{ marginTop: 0 }}>
              <input className="input" type="datetime-local" value={karte.termin ?? ''} onChange={(e) => aendern({ termin: e.target.value || null })} />
              {karte.termin && (
                <button className="btn small" onClick={() => aendern({ termin: null })}>
                  {t('planung.karte.entfernen')}
                </button>
              )}
            </span>
          </label>
        </div>

        <TitelVorschlaege karte={karte} setze={(x) => aendern({ titel: x })} />

        <KartenVideo karte={karte} ersetze={ersetze} aendern={aendern} youtubeVerbunden={youtubeVerbunden} />

        <label className="details-block">
          <span className="muted small">{t('planung.karte.notizen')}</span>
          <textarea className="input" rows={6} value={notizen} onChange={(e) => setNotizen(e.target.value)} onBlur={() => notizen !== karte.notizen && aendern({ notizen })} />
        </label>

        <div className="details-block">
          <span className="muted small">
            {t('planung.karte.checkliste')} {liste.length > 0 && `(${liste.filter((c) => c.erledigt).length}/${liste.length})`}
          </span>
          {liste.map((c, i) => (
            <div key={i} className="punkt">
              <input type="checkbox" checked={c.erledigt} onChange={() => aendern({ checkliste: liste.map((x, j) => (j === i ? { ...x, erledigt: !x.erledigt } : x)) })} />
              <span className={c.erledigt ? 'erledigt' : ''}>{c.text}</span>
              <button className="chip-x" aria-label={t('planung.karte.punktWeg')} onClick={() => aendern({ checkliste: liste.filter((_, j) => j !== i) })}>
                ✕
              </button>
            </div>
          ))}
          <input
            className="input small"
            placeholder={t('planung.karte.punktNeu')}
            value={punkt}
            onChange={(e) => setPunkt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && punkt.trim()) {
                aendern({ checkliste: [...liste, { text: punkt.trim(), erledigt: false }] })
                setPunkt('')
              }
            }}
          />
        </div>

        <div className="details-fuss">
          <span className="muted small">{t('planung.karte.zuletzt', { wann: new Date(karte.updatedAt).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }), geraet: karte.updatedBy })}</span>
          {sicher ? (
            <span className="row" style={{ marginTop: 0 }}>
              <button className="btn small" onClick={() => setSicher(false)}>
                {t('planung.karte.behalten')}
              </button>
              <button className="btn small gefahr" onClick={loeschen}>
                {t('planung.karte.wirklich')}
              </button>
            </span>
          ) : (
            <button className="btn small" onClick={() => setSicher(true)}>
              {t('planung.karte.loeschen')}
            </button>
          )}
        </div>
      </aside>
    </div>
  )
}
