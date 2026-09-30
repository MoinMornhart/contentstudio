import { Card } from '../components/Panel'
import { SCHRITTE } from '../components/SetupWizard'
import { useProfil } from './useProfil'
import { useT } from '../i18n'

/** Schritte des Assistenten, die sich in den Einstellungen bearbeiten lassen (ROADMAP 2.7) */
const BEARBEITBAR = ['person', 'konten', 'darstellung', 'vorbilder', 'marke', 'ki', 'programme']

/** Profil in den Einstellungen: jeder Bereich aufklappbar, Änderungen wirken sofort. */
export function ProfilKarte(): React.JSX.Element {
  const t = useT()
  const { profil, aendere, status } = useProfil()
  return (
    <Card title={t('einst.profil')} badge={status === 'speichert' ? t('profil.speichert') : status === 'gespeichert' ? t('profil.gespeichert') : undefined}>
      <p className="muted small">{t('einst.profilText')}</p>
      {SCHRITTE.filter((s) => BEARBEITBAR.includes(s.id)).map((s) => {
        const Inhalt = s.inhalt
        return (
          <details key={s.id} className="profil-bereich">
            <summary>
              {t(s.titel)}
              {profil?.offen.includes(s.id) && <span className="badge">{t('assi.uebersprungen')}</span>}
            </summary>
            <Inhalt />
          </details>
        )
      })}
      {profil && (
        <label className="switch">
          <input
            type="checkbox"
            checked={profil.einstellungen.vorbildHinweise}
            onChange={(e) => aendere((p) => ({ ...p, einstellungen: { ...p.einstellungen, vorbildHinweise: e.target.checked } }))}
          />
          <span>{t('einst.hinweise')}</span>
        </label>
      )}
      {profil && (
        <label className="switch">
          <input
            type="checkbox"
            checked={profil.einstellungen.minecraftBesitz}
            onChange={(e) => aendere((p) => ({ ...p, einstellungen: { ...p.einstellungen, minecraftBesitz: e.target.checked } }))}
          />
          <span>{t('einst.minecraftBesitz')}</span>
        </label>
      )}
    </Card>
  )
}
