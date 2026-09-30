import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Profil } from '@shared/profil'
import { fehlerText } from '../i18n'

interface ProfilKontext {
  profil: Profil | null
  /** Fehler beim Lesen (Datei kaputt o. Ä.) oder Speichern */
  fehler: string | null
  status: 'bereit' | 'speichert' | 'gespeichert'
  /** Ändert das Profil sofort in der Oberfläche und speichert kurz danach */
  aendere: (fn: (p: Profil) => Profil) => void
  /** Schritt als übersprungen merken bzw. als erledigt austragen */
  offen: (schritt: string, istOffen: boolean) => void
}

const Kontext = createContext<ProfilKontext | null>(null)

/** Lädt das Creator-Profil und hält es für Assistent und Einstellungen bereit. */
export function ProfilProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [profil, setProfil] = useState<Profil | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [status, setStatus] = useState<ProfilKontext['status']>('bereit')
  const aktuell = useRef<Profil | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ungespeichert = useRef(false)

  useEffect(() => {
    void window.cs.profilLaden().then((s) => {
      aktuell.current = s.profil
      setProfil(s.profil)
      setFehler(s.fehler)
    })
    // Änderungen von außen (anderes Gerät, andere Ansicht) übernehmen, solange hier nichts offen ist
    return window.cs.onProfilGeaendert((p) => {
      if (ungespeichert.current) return
      aktuell.current = p
      setProfil(p)
    })
  }, [])

  const speichern = useCallback(() => {
    const p = aktuell.current
    if (!p) return
    setStatus('speichert')
    window.cs.profilSpeichern(p).then(
      (gespeichert) => {
        ungespeichert.current = false
        // Nur „geaendert“ übernehmen; weitere Eingaben seit dem Speichern bleiben erhalten
        if (aktuell.current) aktuell.current = { ...aktuell.current, geaendert: gespeichert.geaendert }
        setStatus('gespeichert')
        setFehler(null)
      },
      (e: unknown) => {
        setStatus('bereit')
        setFehler(fehlerText(e))
      }
    )
  }, [])

  const aendere = useCallback(
    (fn: (p: Profil) => Profil) => {
      if (!aktuell.current) return
      const neu = fn(structuredClone(aktuell.current))
      aktuell.current = neu
      ungespeichert.current = true
      setProfil(neu)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(speichern, 400)
    },
    [speichern]
  )

  const offen = useCallback(
    (schritt: string, istOffen: boolean) =>
      aendere((p) => ({ ...p, offen: istOffen ? [...new Set([...p.offen, schritt])] : p.offen.filter((s) => s !== schritt) })),
    [aendere]
  )

  // Beim Schließen des Fensters nichts verlieren
  useEffect(() => {
    const vorSchliessen = (): void => {
      if (ungespeichert.current && aktuell.current) void window.cs.profilSpeichern(aktuell.current)
    }
    window.addEventListener('beforeunload', vorSchliessen)
    return () => window.removeEventListener('beforeunload', vorSchliessen)
  }, [])

  return <Kontext.Provider value={{ profil, fehler, status, aendere, offen }}>{children}</Kontext.Provider>
}

export function useProfil(): ProfilKontext {
  const k = useContext(Kontext)
  if (!k) throw new Error('useProfil outside ProfilProvider')
  return k
}
