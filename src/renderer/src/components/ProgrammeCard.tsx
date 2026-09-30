import { useEffect, useState } from 'react'
import { PROGRAMME, type ProgrammeStand, type ProgrammId } from '@shared/programme'
import type { Schluessel } from '@shared/i18n'
import { Card } from './Panel'
import { fehlerText, useI18n } from '../i18n'

const NAMEN: Record<ProgrammId, string> = { premiere: 'Premiere Pro', aftereffects: 'After Effects', resolve: 'DaVinci Resolve', capcut: 'CapCut', photoshop: 'Photoshop' }

/**
 * Programme (ROADMAP 7.5): welche Schnitt- und Bildprogramme gefunden wurden, und je Programm ein Selbsttest. Ohne
 * installiertes Programm heißt das Ergebnis „übersprungen“.
 */
export function ProgrammeCard(): React.JSX.Element {
  const { t, locale } = useI18n()
  const [stand, setStand] = useState<ProgrammeStand | null>(null)
  const [laeuft, setLaeuft] = useState<ProgrammId | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  useEffect(() => {
    void window.cs.programmeStatus().then(setStand, (e: unknown) => setFehler(fehlerText(e)))
  }, [])
  const teste = (id: ProgrammId): void => {
    setFehler(null)
    setLaeuft(id)
    window.cs
      .programmSelbsttest(id)
      .then(() => window.cs.programmeStatus().then(setStand), (e: unknown) => setFehler(fehlerText(e)))
      .finally(() => setLaeuft(null))
  }
  return (
    <Card title={t('programme.karte.titel')}>
      <p className="muted small">{t('programme.karte.hinweis')}</p>
      <dl className="facts">
        {PROGRAMME.map((id) => {
          const p = stand?.programme.find((x) => x.id === id)
          const test = stand?.tests[id]
          return (
            <div key={id} style={{ display: 'contents' }}>
              <dt>{NAMEN[id]}</dt>
              <dd>
                <span className={p ? 'own-ok' : 'muted'}>{p ? t('programme.karte.gefunden', { version: p.version ?? '?' }) : t('programme.karte.nicht')}</span>
                {test && (
                  <span className="muted small" title={test.details}>
                    {' · '}
                    {t(`programme.status.${test.status === 'übersprungen' ? 'uebersprungen' : test.status}` as Schluessel)} ({new Date(test.zeit).toLocaleDateString(locale)})
                  </span>
                )}{' '}
                <button className="btn small" disabled={laeuft !== null} onClick={() => teste(id)}>
                  {laeuft === id ? t('programme.karte.laeuft') : t('programme.karte.test')}
                </button>
              </dd>
            </div>
          )
        })}
      </dl>
      <div className="row">
        <button className="btn small" onClick={() => void window.cs.programmeStatus(true).then(setStand)}>
          {t('programme.karte.suchen')}
        </button>
      </div>
      {fehler && <p className="warn small">{fehler}</p>}
    </Card>
  )
}
