// Idee aus MoinStudio src/renderer/src/tabs/LogoTab.tsx (MIT), v0.38.0.
import { useEffect, useState } from 'react'
import { LOGO_EXPORTE, type LogoAuftragInfo, type LogoEintrag, type LogoExport, type LogoVarianteInfo } from '@shared/logo'
import type { Profil } from '@shared/profil'
import { PageHeader } from '../components/Panel'
import { Feld } from '../profil/Bausteine'
import { useProfil } from '../profil/useProfil'
import { fehlerText, useT } from '../i18n'

/**
 * Reiter „Logo“: Logos aus einer Beschreibung erstellen (Kanal-, Serien- oder Server-Logo) – bei Minecraft-Konten aus
 * echten Minecraft-Dateien, sonst in der Schrift der Marke –, Änderungen in Worten als Verlauf, und die Logo-Bibliothek
 * der Marke: hochladen, umbenennen, Standard je Konto, Export als PNG oder YouTube-Wasserzeichen, löschen.
 */
export function LogoTab(): React.JSX.Element {
  const t = useT()
  const { profil } = useProfil()
  const [offen, setOffen] = useState<string | null>(null)
  const [logos, setLogos] = useState<LogoEintrag[]>([])
  useEffect(() => {
    let aktiv = true
    void window.cs.logoListe().then((l) => aktiv && setLogos(l))
    return () => {
      aktiv = false
    }
  }, [])
  return (
    <>
      <PageHeader title={t('tab.logo')} subtitle={t('logo.untertitel')} />
      {profil && (
        <div className="thumb-layout">
          <div className="thumb-links">
            <NeuesLogo profil={profil} gestartet={setOffen} />
            <Bibliothek profil={profil} logos={logos} setzeLogos={setLogos} />
          </div>
          <section className="card">
            <div className="card-head">
              <h2>{t('logo.auftraege')}</h2>
            </div>
            <LogoAuftraege offen={offen} setzeOffen={setOffen} gemerkt={setLogos} />
          </section>
        </div>
      )}
    </>
  )
}

function NeuesLogo({ profil, gestartet }: { profil: Profil; gestartet: (id: string) => void }): React.JSX.Element {
  const t = useT()
  const [kontoWahl, setKonto] = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [anzahl, setAnzahl] = useState(3)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const kontoId = profil.konten.some((k) => k.id === kontoWahl) ? kontoWahl : (profil.konten[0]?.id ?? '')
  const starten = (): void => {
    setFehler(null)
    setLaeuft(true)
    window.cs
      .logoStart({ kontoId, beschreibung, anzahl })
      .then((id) => {
        setBeschreibung('')
        gestartet(id)
      })
      .catch((e: unknown) => setFehler(fehlerText(e)))
      .finally(() => setLaeuft(false))
  }
  if (!profil.konten.length) return <p className="muted">{t('logo.keinKonto')}</p>
  return (
    <section className="card auftrag">
      <div className="card-head">
        <h2>{t('logo.neu')}</h2>
      </div>
      <div className="konto-felder">
        <Feld label={t('thumb.neu.kanal')}>
          <select className="input" value={kontoId} onChange={(e) => setKonto(e.target.value)}>
            {profil.konten.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name.trim() || t('konten.unbenannt')}
              </option>
            ))}
          </select>
        </Feld>
        <Feld label={t('thumb.neu.anzahl')}>
          <select className="input" value={anzahl} onChange={(e) => setAnzahl(Number(e.target.value))}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Feld>
      </div>
      <Feld label={t('logo.beschreibung')} hinweis={t('logo.beschreibungHinweis')}>
        <textarea className="input" rows={3} value={beschreibung} placeholder={t('logo.platzhalter')} onChange={(e) => setBeschreibung(e.target.value)} />
      </Feld>
      {fehler && <p className="warn small">{fehler}</p>}
      <button type="button" className="btn primary" disabled={!kontoId || beschreibung.trim().length < 2 || laeuft} onClick={starten}>
        {t('logo.starten')}
      </button>
    </section>
  )
}

/** Logo-Datei als PNG (data:-URL): SVG, JPG und WebP über ein Canvas umwandeln */
async function alsPng(datei: File): Promise<string> {
  const url = URL.createObjectURL(datei)
  try {
    const bild = new Image()
    bild.src = url
    await bild.decode()
    // SVG ohne feste Größe: großzügig rastern, damit der Export in 2048 px scharf bleibt
    const f = /svg/i.test(datei.type) ? Math.max(1, 2048 / Math.max(bild.naturalWidth || 1, bild.naturalHeight || 1)) : 1
    const w = Math.max(1, Math.round((bild.naturalWidth || 1024) * f))
    const h = Math.max(1, Math.round((bild.naturalHeight || 1024) * f))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(bild, 0, 0, w, h)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

function Bibliothek({ profil, logos, setzeLogos }: { profil: Profil; logos: LogoEintrag[]; setzeLogos: (l: LogoEintrag[]) => void }): React.JSX.Element {
  const t = useT()
  const [meldung, setMeldung] = useState<string | null>(null)
  const hochladen = async (dateien: FileList | null): Promise<void> => {
    setMeldung(null)
    try {
      for (const d of Array.from(dateien ?? [])) setzeLogos(await window.cs.logoHochladen(d.name.replace(/\.[^.]+$/, ''), await alsPng(d)))
    } catch (e) {
      setMeldung(fehlerText(e))
    }
  }
  return (
    <section className="card">
      <div className="card-head">
        <h2>{t('logo.bibliothek')}</h2>
      </div>
      <p className="muted small">{t('logo.bibliothekHinweis')}</p>
      <div className="row logo-hochladen">
        <label className="btn small">
          {t('logo.hochladen')}
          <input type="file" accept=".png,.jpg,.jpeg,.webp,.svg" multiple hidden onChange={(e) => void hochladen(e.target.files)} />
        </label>
      </div>
      {meldung && <p className="warn small">{meldung}</p>}
      {logos.length === 0 ? (
        <p className="muted small">{t('logo.leer')}</p>
      ) : (
        <ul className="logo-liste">
          {logos.map((l) => (
            <LogoZeile key={l.id} l={l} profil={profil} setzeLogos={setzeLogos} />
          ))}
        </ul>
      )}
    </section>
  )
}

function LogoZeile({ l, profil, setzeLogos }: { l: LogoEintrag; profil: Profil; setzeLogos: (l: LogoEintrag[]) => void }): React.JSX.Element {
  const t = useT()
  const [bild, setBild] = useState<string | null>(null)
  const [name, setName] = useState(l.name)
  const [groesse, setGroesse] = useState<LogoExport>('1024')
  const [loeschen, setLoeschen] = useState(false)
  const [meldung, setMeldung] = useState<string | null>(null)
  useEffect(() => {
    let aktiv = true
    void window.cs.logoBild(l.id).then((b) => aktiv && setBild(b))
    return () => {
      aktiv = false
    }
  }, [l.id])
  const aendere = (patch: Parameters<typeof window.cs.logoEintrag>[1]): void => void window.cs.logoEintrag(l.id, patch).then(setzeLogos, (e: unknown) => setMeldung(fehlerText(e)))
  return (
    <li className="logo-zeile">
      <div className="logo-bild">{bild && <img src={bild} alt={l.name} />}</div>
      <div className="logo-felder">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== l.name && aendere({ name })} />
        <div className="row small">
          {profil.konten.map((k) => (
            <label key={k.id} className="check">
              <input type="checkbox" checked={l.standard.includes(k.id)} onChange={(e) => aendere({ standard: { konto: k.id, an: e.target.checked } })} />
              {t('logo.standardFuer', { konto: k.name.trim() || t('konten.unbenannt') })}
            </label>
          ))}
        </div>
        <div className="row">
          <select className="input mini" value={groesse} onChange={(e) => setGroesse(e.target.value as LogoExport)}>
            {LOGO_EXPORTE.map((g) => (
              <option key={g} value={g}>
                {t(`logo.export.${g}`)}
              </option>
            ))}
          </select>
          <button type="button" className="btn small" onClick={() => void window.cs.logoExport({ logo: l.id }, groesse).then((p) => p && setMeldung(t('thumb.export.gespeichert', { datei: p.split(/[\\/]/).pop() ?? p })), (e: unknown) => setMeldung(fehlerText(e)))}>
            {t('logo.export.knopf')}
          </button>
          <button type="button" className="btn small" onClick={() => (loeschen ? aendere({ entfernen: true }) : setLoeschen(true))}>
            {loeschen ? t('thumb.verlauf.wirklich') : t('thumb.verlauf.loeschen')}
          </button>
        </div>
        {meldung && <p className="muted small">{meldung}</p>}
      </div>
    </li>
  )
}

function LogoAuftraege({ offen, setzeOffen, gemerkt }: { offen: string | null; setzeOffen: (id: string | null) => void; gemerkt: (l: LogoEintrag[]) => void }): React.JSX.Element {
  const t = useT()
  const [auftraege, setAuftraege] = useState<LogoAuftragInfo[]>([])
  useEffect(() => {
    let aktiv = true
    const laden = (): void => void window.cs.logoAuftraege().then((a) => aktiv && setAuftraege(a))
    laden()
    const aus = window.cs.onJobsState(laden)
    return () => {
      aktiv = false
      aus()
    }
  }, [])
  if (!auftraege.length) return <p className="muted">{t('logo.keineAuftraege')}</p>
  // Änderungen stehen im Verlauf ihres Ursprungsauftrags
  const haupt = auftraege.filter((a) => !a.eltern || !auftraege.some((x) => x.id === a.eltern))
  const zuAuftrag = (id: string): LogoAuftragInfo[] => auftraege.filter((a) => a.eltern === id).sort((x, y) => x.createdAt.localeCompare(y.createdAt))
  return (
    <ul className="auftraege">
      {haupt.map((a) => {
        const aenderungen = zuAuftrag(a.id)
        const status = [...aenderungen].reverse().find((x) => x.state !== 'done') ?? a
        return (
          <li key={a.id} className={`auftrag-zeile${offen === a.id ? ' offen' : ''}`}>
            <button type="button" className="auftrag-kopf" onClick={() => setzeOffen(offen === a.id ? null : a.id)}>
              <strong>{a.titel}</strong>
              <span className="muted small">
                {aenderungen.length > 0 && `${t('thumb.verlauf.anzahl', { anzahl: aenderungen.length })} · `}
                {t(`thumb.status.${status.state as 'done'}`)}
                {status.state === 'running' && status.progress !== null ? ` · ${status.progress} %` : ''}
                {status.step && status.state !== 'done' ? ` · ${status.step}` : ''}
              </span>
            </button>
            {a.error && <p className="warn small">{a.error}</p>}
            {offen === a.id && a.state === 'done' && <LogoVerlauf auftrag={a} aenderungen={aenderungen} gemerkt={gemerkt} />}
            {offen === a.id && (
              <button type="button" className="btn small" onClick={() => void window.cs.logoLoeschen(a.id).then(() => setzeOffen(null))}>
                {t(aenderungen.length ? 'thumb.verlauf.alleLoeschen' : 'thumb.ergebnis.loeschen')}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function LogoVerlauf({ auftrag, aenderungen, gemerkt }: { auftrag: LogoAuftragInfo; aenderungen: LogoAuftragInfo[]; gemerkt: (l: LogoEintrag[]) => void }): React.JSX.Element {
  const t = useT()
  const [wahl, setWahl] = useState<{ job: string; variante: number } | null>(null)
  const [text, setText] = useState('')
  const [meldung, setMeldung] = useState<string | null>(null)
  const schritte = [auftrag, ...aenderungen]
  const neuestes = [...schritte].reverse().find((s) => s.state === 'done')
  const basis = wahl && schritte.some((s) => s.id === wahl.job) ? wahl : neuestes ? { job: neuestes.id, variante: 0 } : null
  const senden = (): void => {
    if (!basis || !text.trim()) return
    setMeldung(null)
    window.cs.logoAendern(basis.job, basis.variante, text).then(
      () => {
        setText('')
        setWahl(null)
      },
      (e: unknown) => setMeldung(fehlerText(e))
    )
  }
  return (
    <div className="verlauf">
      <LogoVarianten jobId={auftrag.id} gewaehlt={basis?.job === auftrag.id ? basis.variante : null} waehle={(i) => setWahl({ job: auftrag.id, variante: i })} gemerkt={gemerkt} />
      {aenderungen.map((a, n) => (
        <div key={a.id} className="verlauf-schritt">
          <div className="verlauf-wunsch">
            <span className="verlauf-nr">{t('thumb.verlauf.aenderung', { nr: n + 1 })}</span>
            <span>„{a.wunsch}“</span>
          </div>
          {a.state === 'done' ? (
            <LogoVarianten jobId={a.id} gewaehlt={basis?.job === a.id ? basis.variante : null} waehle={(i) => setWahl({ job: a.id, variante: i })} gemerkt={gemerkt} />
          ) : (
            <p className={a.state === 'failed' ? 'warn small' : 'muted small'}>{a.state === 'failed' ? a.error : `${t(`thumb.status.${a.state as 'done'}`)}${a.step ? ` · ${a.step}` : ''}`}</p>
          )}
        </div>
      ))}
      {basis && (
        <div className="verlauf-eingabe">
          <div className="row">
            <input className="input" placeholder={t('logo.aendernPlatzhalter')} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && text.trim() && senden()} />
            <button type="button" className="btn primary" disabled={!text.trim()} onClick={senden}>
              {t('thumb.aendern.knopf')}
            </button>
          </div>
          {meldung && <p className="warn small">{meldung}</p>}
        </div>
      )}
    </div>
  )
}

function LogoVarianten({ jobId, gewaehlt, waehle, gemerkt }: { jobId: string; gewaehlt: number | null; waehle: (i: number) => void; gemerkt: (l: LogoEintrag[]) => void }): React.JSX.Element {
  const t = useT()
  const [varianten, setVarianten] = useState<LogoVarianteInfo[] | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  useEffect(() => {
    let aktiv = true
    void window.cs.logoErgebnis(jobId).then((v) => aktiv && setVarianten(v))
    return () => {
      aktiv = false
    }
  }, [jobId])
  if (!varianten) return <p className="muted small">{t('app.laden')}</p>
  return (
    <div className="variant-grid">
      {varianten.map((v, i) => (
        <figure key={i} className={gewaehlt === i ? 'variant gewaehlt logo-variante' : 'variant logo-variante'}>
          {v.bild ? <img src={v.bild} alt={v.titel} /> : <p className="warn small">{v.fehler ?? t('thumb.fehler.render')}</p>}
          <figcaption>
            <strong>{v.titel}</strong>
            {v.warnungen.map((w, k) => (
              <p key={k} className="muted small">
                {w}
              </p>
            ))}
            {v.bild && (
              <div className="row">
                <button type="button" className="btn small primary" onClick={() => void window.cs.logoMerken(jobId, i, v.titel).then((l) => (gemerkt(l), setMeldung(t('logo.gemerkt'))), (e: unknown) => setMeldung(fehlerText(e)))}>
                  {t('logo.merken')}
                </button>
                <button type="button" className={gewaehlt === i ? 'btn small primary' : 'btn small'} aria-pressed={gewaehlt === i} onClick={() => waehle(i)}>
                  ✏️ {t(gewaehlt === i ? 'thumb.verlauf.gewaehlt' : 'thumb.verlauf.waehlen')}
                </button>
              </div>
            )}
            {meldung && <p className="muted small">{meldung}</p>}
          </figcaption>
        </figure>
      ))}
    </div>
  )
}
