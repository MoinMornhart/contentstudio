import { describe, expect, it } from 'vitest'
import { TABS, isTabId } from '@shared/app'
import { parseScreenshotArg } from '../../src/main/screenshot'

describe('Reiter', () => {
  it('enthält die Hauptreiter in der richtigen Reihenfolge, dazu Logo und Einstellungen', () => {
    expect(TABS.map((t) => t.id)).toEqual(['thumbnail', 'schnitt', 'planung', 'logo', 'einstellungen'])
  })

  it('erkennt gültige und ungültige Reiter-IDs', () => {
    expect(isTabId('schnitt')).toBe(true)
    expect(isTabId('adobe')).toBe(false)
    expect(isTabId(42)).toBe(false)
  })
})

describe('Screenshot-Modus', () => {
  it('liest den Zielordner aus den Startargumenten', () => {
    const dir = parseScreenshotArg(['electron', '.', '--cs-screenshot=test-output/shots'])
    expect(dir).toMatch(/test-output[\\/]shots$/)
  })

  it('ist ohne Flag oder mit leerem Wert aus', () => {
    expect(parseScreenshotArg(['electron', '.'])).toBeNull()
    expect(parseScreenshotArg(['--cs-screenshot='])).toBeNull()
  })
})
