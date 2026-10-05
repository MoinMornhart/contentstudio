import { useEffect, useState } from 'react'
import { LOGO_GROESSEN, LOGO_POSITIONEN, type LogoEintrag, type ThumbLogoWahl } from '@shared/logo'
import { Feld } from '../profil/Bausteine'
import { useT } from '../i18n'

/**
 * Logo im Thumbnail (aus MoinStudio v0.38.0): Standard-Logo des Kontos, ein Logo der Bibliothek oder keins, dazu Ecke
 * und Größe. Es steht nie über Gesichtern, Figuren oder Text – ist die Ecke belegt, weicht es selbst aus.
 */
export function LogoWahl({ kontoId, wahl, setze }: { kontoId: string; wahl: ThumbLogoWahl; setze: (w: ThumbLogoWahl) => void }): React.JSX.Element {
  const t = useT()
  const [logos, setLogos] = useState<LogoEintrag[]>([])
  useEffect(() => {
    let aktiv = true
    void window.cs.logoListe().then((l) => aktiv && setLogos(l))
    return () => {
      aktiv = false
    }
  }, [])
  const standard = logos.find((l) => l.standard.includes(kontoId)) ?? logos[0]
  return (
    <div className="konto-felder">
      <Feld label={t('logo.wahl.logo')}>
        <select className="input" value={wahl.id ?? ''} onChange={(e) => setze({ ...wahl, id: e.target.value || null })}>
          <option value="standard">{standard ? t('logo.wahl.standardMit', { name: standard.name }) : t('logo.wahl.standardKeins')}</option>
          {logos.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
          <option value="">{t('logo.wahl.keins')}</option>
        </select>
      </Feld>
      {wahl.id !== null && (logos.length > 0 || wahl.id !== 'standard') && (
        <>
          <Feld label={t('logo.wahl.ecke')}>
            <select className="input" value={wahl.position} onChange={(e) => setze({ ...wahl, position: e.target.value as ThumbLogoWahl['position'] })}>
              {LOGO_POSITIONEN.map((p) => (
                <option key={p} value={p}>
                  {t(p === 'auto' ? 'logo.ecke.auto' : `logo.ecke.${p}`)}
                </option>
              ))}
            </select>
          </Feld>
          <Feld label={t('logo.wahl.groesse')}>
            <select className="input" value={wahl.groesse} onChange={(e) => setze({ ...wahl, groesse: e.target.value as ThumbLogoWahl['groesse'] })}>
              {LOGO_GROESSEN.map((g) => (
                <option key={g} value={g}>
                  {t(`logo.groesse.${g}`)}
                </option>
              ))}
            </select>
          </Feld>
        </>
      )}
    </div>
  )
}
