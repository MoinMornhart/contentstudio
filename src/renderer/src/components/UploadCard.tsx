import { useEffect, useState } from 'react'
import { Card } from './Panel'
import { useProfil } from '../profil/useProfil'
import { fehlerText, useT } from '../i18n'

/**
 * Hochladen (ROADMAP 6.5): Standard ist kein automatisches Hochladen. Optional verbindet der Creator ein YouTube-Konto
 * über die offizielle Anmeldung von Google, mit einem eigenen OAuth-Client. Ungetestet, bis ein Mensch es verbindet.
 */
export function UploadCard(): React.JSX.Element {
  const t = useT()
  const { profil } = useProfil()
  const youtube = (profil?.konten ?? []).filter((k) => k.plattform === 'youtube' || k.plattform === 'youtube-shorts')
  const [verbunden, setVerbunden] = useState<{ kontoId: string; verbunden: string }[]>([])
  const [kontoId, setKonto] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  useEffect(() => {
    void window.cs.uploadVerbindungen().then(setVerbunden, () => undefined)
  }, [])
  const ziel = kontoId || youtube[0]?.id || ''
  const name = (id: string): string => profil?.konten.find((k) => k.id === id)?.name.trim() || t('konten.unbenannt')
  const verbinden = (): void => {
    setFehler(null)
    setLaeuft(true)
    window.cs
      .uploadVerbinden(ziel, { clientId, clientSecret })
      .then((v) => {
        setVerbunden(v)
        setClientSecret('')
      }, (e: unknown) => setFehler(fehlerText(e)))
      .finally(() => setLaeuft(false))
  }
  return (
    <Card title={t('upload.karte.titel')} badge={t('upload.karte.ungetestet')}>
      <p className="muted small">{t('upload.karte.hinweis')}</p>
      {verbunden.map((v) => (
        <div key={v.kontoId} className="row" style={{ alignItems: 'center' }}>
          <span className="own-ok">✓ {t('upload.karte.verbunden', { konto: name(v.kontoId) })}</span>
          <button className="btn small" onClick={() => void window.cs.uploadTrennen(v.kontoId).then(setVerbunden)}>
            {t('upload.karte.trennen')}
          </button>
        </div>
      ))}
      {youtube.length === 0 ? (
        <p className="muted small">{t('upload.karte.keinYoutube')}</p>
      ) : (
        <details>
          <summary className="small">{t('upload.karte.verbinden')}</summary>
          <p className="muted small">{t('upload.karte.anleitung')}</p>
          <div className="details-felder">
            <select className="input" value={ziel} aria-label={t('schnitt.neu.konto')} onChange={(e) => setKonto(e.target.value)}>
              {youtube.map((k) => (
                <option key={k.id} value={k.id}>
                  {name(k.id)}
                </option>
              ))}
            </select>
            <input className="input" placeholder={t('upload.karte.clientId')} value={clientId} onChange={(e) => setClientId(e.target.value)} />
            <input className="input" type="password" placeholder={t('upload.karte.clientSecret')} value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
            <button className="btn primary" disabled={laeuft || !clientId.trim() || !clientSecret.trim()} onClick={verbinden}>
              {laeuft ? t('upload.karte.imBrowser') : t('upload.karte.anmelden')}
            </button>
          </div>
        </details>
      )}
      {fehler && <p className="warn small">{fehler}</p>}
    </Card>
  )
}
