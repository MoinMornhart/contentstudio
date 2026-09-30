import { PageHeader } from '../components/Panel'
import { DarstellungEditor } from '../profil/SchrittDarstellung'
import { neuesKonto } from '../profil/SchrittKonten'
import { useProfil } from '../profil/useProfil'
import { useI18n } from '../i18n'

/**
 * Thumbnail-Reiter. Die Thumbnail-Erstellung selbst kommt mit ROADMAP M4. Schon jetzt fragt der Reiter nach, was im
 * Assistenten übersprungen wurde und für Thumbnails nötig ist: wie der Creator im Bild aussieht (ROADMAP 2.6).
 * Gibt es noch gar keinen Kanal, lässt sich hier direkt einer anlegen.
 */
export function ThumbnailTab(): React.JSX.Element {
  const { t, sprache } = useI18n()
  const { profil, aendere } = useProfil()
  const ohneDarstellung = profil?.konten.filter((k) => k.darstellung.length === 0) ?? []
  const ohneKonto = profil !== null && profil.konten.length === 0
  return (
    <>
      <PageHeader title={t('leer.thumbnail.titel')} subtitle={t('leer.thumbnail.text')} />
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
    </>
  )
}
