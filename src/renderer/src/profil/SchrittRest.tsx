import { useEffect, useState } from 'react'
import type { ProgrammFundInfo, ToolId, ToolStatus } from '@shared/app'
import type { Schluessel } from '@shared/i18n'
import { brauchtDreiD, brauchtFreistellen, PROGRAMME } from '@shared/profil'
import { HardwareCard, useHardwareState } from '../components/HardwareCard'
import { ToolsCard } from '../components/ToolsCard'
import { useSprachName } from './Bausteine'
import { useProfil } from './useProfil'
import { KiWege } from './KiWege'
import { useT } from '../i18n'

export function KiSchritt(): React.JSX.Element {
  const t = useT()
  return (
    <div className="setup-text">
      <h2>{t('ki.titel')}</h2>
      <KiWege />
    </div>
  )
}

export function ProgrammeSchritt(): React.JSX.Element | null {
  const t = useT()
  const { profil, aendere } = useProfil()
  const [funde, setFunde] = useState<ProgrammFundInfo[] | null>(null)
  useEffect(() => {
    void window.cs.programmeFinden().then(setFunde)
  }, [])
  // Beim ersten Besuch die gefundenen Programme vorauswählen
  useEffect(() => {
    if (funde?.length && profil && profil.programme.length === 0 && !profil.offen.includes('programme-gesehen')) {
      aendere((p) => ({ ...p, programme: [...new Set(funde.map((f) => f.id))], offen: [...p.offen, 'programme-gesehen'] }))
    }
  }, [funde, profil, aendere])
  if (!profil) return null
  const umschalten = (id: (typeof PROGRAMME)[number]): void =>
    aendere((p) => ({ ...p, programme: p.programme.includes(id) ? p.programme.filter((x) => x !== id) : [...p.programme, id] }))
  return (
    <div className="setup-text">
      <h2>{t('prog.titel')}</h2>
      <p className="muted">{t('prog.text')}</p>
      <ul className="programme">
        {PROGRAMME.map((id) => (
          <li key={id}>
            <label className="switch">
              <input type="checkbox" checked={profil.programme.includes(id)} onChange={() => umschalten(id)} />
              <span>{t(`prog.${id}` as Schluessel)}</span>
              {funde?.some((f) => f.id === id) && <span className="badge">{t('prog.gefunden')}</span>}
            </label>
          </li>
        ))}
      </ul>
      <button type="button" className="btn small" onClick={() => aendere((p) => ({ ...p, programme: [] }))}>
        {t('prog.keines')}
      </button>
    </div>
  )
}

export function HardwareSchritt(): React.JSX.Element {
  const t = useT()
  return (
    <div className="setup-text">
      <h2>{t('assi.schritt.hardware')}</h2>
      <p className="muted">{t('hwschritt.text')}</p>
      <div className="grid">
        <HardwareCard />
      </div>
    </div>
  )
}

const WERKZEUG_NAME: Record<ToolId, string> = { ffmpeg: 'FFmpeg', uv: 'Python (uv)', blender: 'Blender' }

export function WerkzeugeSchritt(): React.JSX.Element {
  const t = useT()
  const hw = useHardwareState()
  const [noetig, setNoetig] = useState<ToolId[]>([])
  const [status, setStatus] = useState<ToolStatus[] | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  useEffect(() => {
    void window.cs.werkzeugeNoetig().then(setNoetig)
    void window.cs.toolsStatus().then(setStatus)
  }, [])
  const fehlt = noetig.filter((id) => !status?.some((s) => s.id === id && s.installed))
  const laden = async (): Promise<void> => {
    setLaeuft(true)
    try {
      for (const id of fehlt) setStatus(await window.cs.installTool(id))
      // Kommt 3D neu dazu, misst der Hardware-Test Blender nach
      if (noetig.includes('blender') && hw?.state === 'done' && hw.profile.config.blenderUebersprungen) await window.cs.runHardwareTest()
    } finally {
      setLaeuft(false)
    }
  }
  return (
    <div className="setup-text">
      <h2>{t('assi.schritt.werkzeuge')}</h2>
      <p>{t('wz.text', { liste: noetig.map((id) => WERKZEUG_NAME[id]).join(', ') })}</p>
      {status && fehlt.length === 0 ? (
        <p className="ok-note">{t('wz.fertig')}</p>
      ) : (
        <button type="button" className="btn primary" disabled={laeuft || !status} onClick={() => void laden()}>
          {laeuft ? t('setup.werkzeuge.laeuft') : t('wz.laden')}
        </button>
      )}
      <div className="grid" key={laeuft ? 'l' : 'r'}>
        <ToolsCard />
      </div>
    </div>
  )
}

/** Lesbare Liste der offenen (übersprungenen) Schritte */
const OFFEN_NAME: Record<string, Schluessel> = {
  person: 'assi.schritt.person',
  konten: 'assi.schritt.konten',
  darstellung: 'assi.schritt.darstellung',
  vorbilder: 'assi.schritt.vorbilder',
  marke: 'assi.schritt.marke',
  ki: 'assi.schritt.ki',
  programme: 'assi.schritt.programme',
  hardware: 'assi.schritt.hardware',
  werkzeuge: 'assi.schritt.werkzeuge'
}

export function Zusammenfassung(): React.JSX.Element | null {
  const t = useT()
  const sprachName = useSprachName()
  const { profil } = useProfil()
  if (!profil) return null
  const punkte: string[] = []
  if (profil.konten.length) punkte.push(t('fertig.konten', { anzahl: profil.konten.length }))
  if (brauchtDreiD(profil)) punkte.push(t('fertig.thumb3d'))
  if (brauchtFreistellen(profil)) punkte.push(t('fertig.thumbFoto'))
  if (!brauchtDreiD(profil) && !brauchtFreistellen(profil)) punkte.push(t('fertig.thumbOhne'))
  const sprachen = [...new Set([...profil.person.sprachen, ...profil.konten.map((k) => k.sprache)])]
  punkte.push(t('fertig.schnitt', { sprachen: sprachen.map(sprachName).join(', ') || sprachName('de') }))
  const slots = profil.konten.reduce((n, k) => n + k.rhythmus.length, 0)
  if (slots) punkte.push(t('fertig.planung', { anzahl: slots }))
  if (profil.programme.length) punkte.push(t('fertig.export', { programme: profil.programme.map((p) => t(`prog.${p}` as Schluessel)).join(', ') }))
  const offen = profil.offen.filter((o) => OFFEN_NAME[o]).map((o) => t(OFFEN_NAME[o]!))
  const letztes = profil.konten.flatMap((k) => k.metadaten?.videos ?? []).sort((a, b) => b.veroeffentlicht.localeCompare(a.veroeffentlicht))[0]
  return (
    <div className="setup-text">
      <h2>{t('fertig.titel')}</h2>
      <ul>
        {punkte.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <p className="muted">{t('fertig.ohneKi')}</p>
      {offen.length > 0 && <p className="muted">{t('fertig.offen', { liste: offen.join(', ') })}</p>}
      <p className="ok-note">{letztes ? t('fertig.vorschlag', { titel: letztes.titel }) : t('fertig.vorschlagAllg')}</p>
      <p className="muted small">{t('setup.fertig.smartscreen')}</p>
    </div>
  )
}
