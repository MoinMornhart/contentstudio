/**
 * JSON aus KI-Antworten lesen. Anbieter ohne verlässliches JSON-Schema antworten oft mit Codeblock („```json … ```“),
 * Einleitungssatz oder Nachwort. Gelesen wird das erste vollständige JSON-Objekt bzw. -Array.
 */
export function jsonAusText(text: string): unknown {
  const t = text.trim()
  try {
    return JSON.parse(t)
  } catch {
    // weiter unten suchen
  }
  const block = /```(?:json)?\s*([\s\S]*?)```/i.exec(t)
  if (block) {
    try {
      return JSON.parse(block[1]!.trim())
    } catch {
      // weiter unten suchen
    }
  }
  const start = t.search(/[[{]/)
  if (start === -1) throw new Error('no JSON found in the answer')
  const ende = passendesEnde(t, start)
  if (ende === -1) throw new Error('JSON in the answer is incomplete')
  return JSON.parse(t.slice(start, ende + 1))
}

/** Index der schließenden Klammer zur öffnenden an `start` (Strings und Escapes beachtet), -1 wenn keine */
function passendesEnde(t: string, start: number): number {
  const stapel: string[] = []
  let inString = false
  for (let i = start; i < t.length; i++) {
    const c = t[i]!
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') stapel.push('}')
    else if (c === '[') stapel.push(']')
    else if (c === '}' || c === ']') {
      if (stapel.pop() !== c) return -1
      if (stapel.length === 0) return i
    }
  }
  return -1
}
