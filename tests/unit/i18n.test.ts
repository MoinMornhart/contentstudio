import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { de } from '../../src/shared/i18n/de'
import { en } from '../../src/shared/i18n/en'
import { spracheAusSystem, uebersetze } from '../../src/shared/i18n'

const platzhalter = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort()

function dateien(dir: string, endung: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? dateien(p, endung) : p.endsWith(endung) ? [p] : []
  })
}

describe('Wörterbücher', () => {
  it('Deutsch und Englisch haben dieselben Schlüssel', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort())
  })

  it('jeder Text hat in beiden Sprachen dieselben Platzhalter und ist nicht leer', () => {
    for (const key of Object.keys(de) as (keyof typeof de)[]) {
      expect(platzhalter(en[key]), key).toEqual(platzhalter(de[key]))
      expect(en[key].trim().length, key).toBeGreaterThan(0)
    }
  })

  it('setzt Werte ein und wählt die Sprache aus der Systemsprache', () => {
    expect(uebersetze('de', 'update.neu', { version: '1.2.3' })).toBe('Neue Version 1.2.3 verfügbar.')
    expect(uebersetze('en', 'update.neu', { version: '1.2.3' })).toBe('New version 1.2.3 available.')
    expect(spracheAusSystem('de-AT')).toBe('de')
    expect(spracheAusSystem('en-US')).toBe('en')
    expect(spracheAusSystem('fr-FR')).toBe('en')
    expect(spracheAusSystem(undefined)).toBe('en')
  })
})

describe('Keine fest verdrahteten Texte in der Oberfläche', () => {
  // Erlaubt: Eigennamen, die in jeder Sprache gleich sind
  const ERLAUBT = new Set(['Electron', 'Chromium', 'Node'])
  const buchstaben = /[A-Za-zÄÖÜäöüß]{2,}/
  const SICHTBAR = new Set(['title', 'placeholder', 'aria-label', 'alt'])

  function festeTexte(name: string, code: string): string[] {
    const funde: string[] = []
    const quelle = ts.createSourceFile(name, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const besuche = (n: ts.Node): void => {
      if (ts.isJsxText(n)) {
        const text = n.text.trim()
        if (text && buchstaben.test(text) && !ERLAUBT.has(text)) funde.push(`${name}: ${text}`)
      }
      if (ts.isJsxAttribute(n) && n.initializer && ts.isStringLiteral(n.initializer) && SICHTBAR.has(n.name.getText()) && buchstaben.test(n.initializer.text)) {
        funde.push(`${name}: ${n.name.getText()}="${n.initializer.text}"`)
      }
      ts.forEachChild(n, besuche)
    }
    besuche(quelle)
    return funde
  }

  it('Gegenprobe: erkennt feste Texte, ignoriert Generics und Ausdrücke', () => {
    const code = [
      'const x = useState<string | null>(null)',
      `export const A = () => <div title="Hallo"><p>Fester Text</p><p>{t('app.name')}</p><dt>Node</dt></div>`
    ].join('\n')
    expect(festeTexte('probe.tsx', code)).toEqual(['probe.tsx: title="Hallo"', 'probe.tsx: Fester Text'])
  })

  it('JSX-Text und sichtbare Attribute kommen aus dem Wörterbuch', () => {
    const funde = dateien(join(__dirname, '../../src/renderer/src'), '.tsx').flatMap((d) => festeTexte(d, readFileSync(d, 'utf8')))
    expect(funde).toEqual([])
  })
})
