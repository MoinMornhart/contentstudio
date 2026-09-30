import { useEffect, useState } from 'react'
import type { McpZiel } from '@shared/ki'
import { fehlerText, useT } from '../i18n'

/** Wert mit Kopier-Knopf */
function Kopierbar({ label, wert }: { label: string; wert: string }): React.JSX.Element {
  const t = useT()
  const [kopiert, setKopiert] = useState(false)
  return (
    <div className="kopierbar">
      <span className="muted small">{label}</span>
      <code className="path">{wert}</code>
      <button
        type="button"
        className="btn small"
        onClick={() =>
          void navigator.clipboard.writeText(wert).then(() => {
            setKopiert(true)
            setTimeout(() => setKopiert(false), 1500)
          })
        }
      >
        {kopiert ? t('mcp.kopiert') : t('mcp.kopieren')}
      </button>
    </div>
  )
}

/** MCP (ROADMAP 3.7): Claude Desktop automatisch eintragen, ChatGPT Desktop mit Anleitung zum Selbst-Eintragen */
export function DesktopApps(): React.JSX.Element {
  const t = useT()
  const [ziele, setZiele] = useState<McpZiel[] | null>(null)
  const [eintrag, setEintrag] = useState<{ command: string; args: string[]; env: Record<string, string> } | null>(null)
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    void window.cs.mcpZiele().then(setZiele)
    void window.cs.mcpEintrag().then(setEintrag)
  }, [])
  const verbinden = (id: McpZiel['id']): void => {
    setMeldung(null)
    window.cs.mcpVerbinden(id).then(
      (z) => {
        setZiele(z)
        setMeldung({ ok: true, text: t('mcp.neustart') })
      },
      (e: unknown) => setMeldung({ ok: false, text: fehlerText(e) })
    )
  }
  return (
    <div className="desktop-apps">
      <h3>{t('mcp.titel')}</h3>
      <p className="muted small">{t('mcp.text')}</p>
      <ul className="ki-liste">
        {(ziele ?? []).map((z) => (
          <li key={z.id} className={`ki-weg${z.verbunden ? ' an' : ''}`}>
            <div className="ki-weg-kopf">
              <strong>{z.name}</strong>
              <span className={z.verbunden ? 'dot ok' : 'dot'} aria-hidden="true" />
              <span className="muted small">{!z.installiert ? t('mcp.nichtInstalliert') : z.verbunden ? t('mcp.verbunden') : ''}</span>
              {z.automatisch && z.installiert && (
                <button type="button" className={z.verbunden ? 'btn small' : 'btn small primary'} onClick={() => verbinden(z.id)}>
                  {z.verbunden ? t('mcp.erneuern') : t('mcp.verbinden')}
                </button>
              )}
            </div>
            {!z.automatisch && z.installiert && eintrag && (
              <>
                <p className="muted small">{t('mcp.selbst')}</p>
                <Kopierbar label={t('mcp.befehl')} wert={eintrag.command} />
                {eintrag.args.map((a) => (
                  <Kopierbar key={a} label={t('mcp.argumente')} wert={a} />
                ))}
                {Object.entries(eintrag.env).map(([k, v]) => (
                  <Kopierbar key={k} label={t('mcp.umgebung')} wert={`${k}=${v}`} />
                ))}
              </>
            )}
          </li>
        ))}
      </ul>
      {eintrag && !eintrag.args[0]?.includes('app.asar') && <p className="muted small">{t('mcp.entwicklung')}</p>}
      {meldung && <p className={meldung.ok ? 'ok-note small' : 'warn small'}>{meldung.text}</p>}
    </div>
  )
}
