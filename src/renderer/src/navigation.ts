import type { TabId } from '@shared/app'

/**
 * Sprung zwischen Reitern mit Ziel (z. B. aus einer Planungskarte ins passende Schnitt-Projekt). Der Zielreiter wird
 * erst beim Wechsel eingehängt; deshalb wartet das Ziel hier, bis der Reiter es abholt.
 */
const wartend = new Map<TabId, string>()
export const OEFFNE_EREIGNIS = 'cs-oeffne'

export function oeffne(tab: TabId, ziel?: string): void {
  if (ziel) wartend.set(tab, ziel)
  window.dispatchEvent(new CustomEvent<{ tab: TabId; ziel?: string }>(OEFFNE_EREIGNIS, { detail: { tab, ziel } }))
}

/** Holt das wartende Ziel eines Reiters ab (nur einmal). */
export function abholen(tab: TabId): string | null {
  const z = wartend.get(tab) ?? null
  wartend.delete(tab)
  return z
}
