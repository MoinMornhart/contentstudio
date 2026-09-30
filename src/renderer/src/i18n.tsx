import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { SpracheStand } from '@shared/app'
import { gebietsschema, uebersetze, type Schluessel, type Sprache, type Werte } from '@shared/i18n'

interface I18n {
  sprache: Sprache
  stand: SpracheStand | null
  /** Text in der aktuellen Sprache */
  t: (schluessel: Schluessel, werte?: Werte) => string
  /** Gebietsschema für Datum und Zahlen, z. B. „de-DE“ */
  locale: string
  /** null = wie Windows */
  setzeSprache: (sprache: Sprache | null) => Promise<void>
}

const Kontext = createContext<I18n | null>(null)

/** Lädt die Sprache aus dem Hauptprozess (Einstellungen oder Windows) und stellt `t()` für alle Komponenten bereit. */
export function I18nProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [stand, setStand] = useState<SpracheStand | null>(null)
  useEffect(() => {
    void window.cs.sprache().then(setStand)
  }, [])
  const sprache: Sprache = stand?.wirksam ?? (navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en')
  useEffect(() => {
    document.documentElement.lang = sprache
  }, [sprache])
  const setzeSprache = useCallback(async (s: Sprache | null) => setStand(await window.cs.setzeSprache(s)), [])
  const wert = useMemo<I18n>(
    () => ({ sprache, stand, t: (k, w) => uebersetze(sprache, k, w), locale: gebietsschema(sprache), setzeSprache }),
    [sprache, stand, setzeSprache]
  )
  return <Kontext.Provider value={wert}>{children}</Kontext.Provider>
}

export function useI18n(): I18n {
  const k = useContext(Kontext)
  if (!k) throw new Error('useI18n outside I18nProvider')
  return k
}

/** Kurzform: nur die Übersetzungsfunktion */
export function useT(): I18n['t'] {
  return useI18n().t
}

/** Fehlermeldung aus einem IPC-Aufruf ohne Electron-Vorspann */
export function fehlerText(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
