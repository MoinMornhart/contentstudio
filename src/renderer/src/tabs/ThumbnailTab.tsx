import { useEffect, useState } from 'react'
import { PageHeader } from '../components/Panel'
import { DarstellungEditor } from '../profil/SchrittDarstellung'
import { neuesKonto } from '../profil/SchrittKonten'
import { useProfil } from '../profil/useProfil'
import { AuftragsKarte, type AuftragsVorschlag } from '../thumbnail/Auftrag'
import { AuftragsListe } from '../thumbnail/Ergebnisse'
import { VorbilderKarte } from '../thumbnail/Vorbilder'
import { useI18n } from '../i18n'

/**
 * Thumbnail-Reiter (ROADMAP M4): neuer Auftrag, Vorbilder und Stilbuch des Kanals, Aufträge mit Varianten.
 * Fehlt noch, wie der Creator im Bild aussieht, fragt der Reiter das zuerst nach (ROADMAP 2.6).
 */
export function ThumbnailTab(): React.JSX.Element {
  const { t, sprache } = useI18n()
  const { profil, aendere } = useProfil()
  const [kontoWahl, setKonto] = useState<string | null>(null)
  const [offen, setOffen] = useState<string | null>(null)
  const [ki, setKi] = useState({ ki: false, bildKi: false })
  const [vorschlag, setVorschlag] = useState<AuftragsVorschlag | null>(null)
  useEffect(() => {
    let aktiv = true
    void window.cs.thumbKiStand().then((s) => aktiv && setKi(s))
    return () => {
      aktiv = false
    }
  }, [])
  const ohneDarstellung = profil?.konten.filter((k) => k.darstellung.length === 0) ?? []
  const ohneKonto = profil !== null && profil.konten.length === 0
  const kontoId = kontoWahl && profil?.konten.some((k) => k.id === kontoWahl) ? kontoWahl : (profil?.konten[0]?.id ?? '')
  return (
    <>
      <PageHeader title={t('leer.thumbnail.titel')} subtitle={t('thumb.untertitel')} />
      {(ohneDarstellung.length > 0 || ohneKonto) && (
        <section className="card nachfrage">
          <div className="card-head">
            <h2>{t('leer.thumbnail.nachfrage')}</h2>
          </div>
          {ohneKonto && (
            <button type="button" className="btn primary" onClick={() => aendere((p) => ({ ...p, konten: [...p.konten, neuesKonto(p.person.sprachen[0] ?? sprache)] }))}>
              {t('konten.hinzu')}
            </button>
          )}
          {ohneDarstellung.map((k) => (
            <div key={k.id} className="darstellung-block">
              <strong>{t('darst.fuerKanal', { kanal: k.name.trim() || t('konten.unbenannt') })}</strong>
              <DarstellungEditor
                liste={k.darstellung}
                setze={(fn) => {
                  aendere((p) => ({ ...p, konten: p.konten.map((x) => (x.id === k.id ? { ...x, darstellung: fn(x.darstellung) } : x)), offen: p.offen.filter((o) => o !== 'darstellung') }))
                }}
              />
            </div>
          ))}
        </section>
      )}
      {profil && kontoId && (
        <div className="thumb-layout">
          <div className="thumb-links">
            <AuftragsKarte
              profil={profil}
              kontoId={kontoId}
              setzeKonto={setKonto}
              ki={ki}
              vorschlag={vorschlag}
              gestartet={(id) => {
                setOffen(id)
              }}
            />
            <VorbilderKarte kontoId={kontoId} bildKi={ki.bildKi} />
          </div>
          <section className="card">
            <div className="card-head">
              <h2>{t('thumb.ergebnis.titel')}</h2>
            </div>
            <AuftragsListe offen={offen} setzeOffen={setOffen} vorbildHinweise={profil.einstellungen.vorbildHinweise} vorschlagen={setVorschlag} />
          </section>
        </div>
      )}
    </>
  )
}
