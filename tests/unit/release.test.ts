import { describe, expect, it } from 'vitest'
import { bumpVersion, changelogSection, parseChangelog, releaseUnreleased, renderReadmeBlock } from '../../scripts/release-lib.mts'

describe('bumpVersion', () => {
  it('erhöht patch, minor und major nach SemVer', () => {
    expect(bumpVersion('0.0.9', 'patch')).toBe('0.0.10')
    expect(bumpVersion('0.0.10', 'minor')).toBe('0.1.0')
    expect(bumpVersion('0.9.3', 'major')).toBe('1.0.0')
  })
  it('übernimmt eine explizite Version und lehnt Unsinn ab', () => {
    expect(bumpVersion('0.1.0', '1.0.0')).toBe('1.0.0')
    expect(() => bumpVersion('0.1.0', 'huge')).toThrow()
    expect(() => bumpVersion('x', 'patch')).toThrow()
  })
})

const CHANGELOG = `# Changelog

Intro.

## [Unreleased]

### Hinzugefügt
- Neue Sache.

## [0.0.2] - 2026-09-26

> Zweite Version

- Punkt

## [0.0.1] - 2026-09-25

- Erster Punkt als Ersatz
`

describe('Changelog', () => {
  it('schließt Unreleased als neue Version ab und legt einen leeren Abschnitt an', () => {
    const out = releaseUnreleased(CHANGELOG, '0.0.3', '2026-09-27', 'Dritte Version')
    expect(out).toContain('## [Unreleased]\n\n## [0.0.3] - 2026-09-27\n\n> Dritte Version\n\n### Hinzugefügt\n- Neue Sache.')
    expect(parseChangelog(out).map((e) => e.version)).toEqual(['0.0.3', '0.0.2', '0.0.1'])
  })
  it('verweigert ein leeres Unreleased', () => {
    const empty = CHANGELOG.replace('### Hinzugefügt\n- Neue Sache.\n', '')
    expect(() => releaseUnreleased(empty, '0.0.3', '2026-09-27', 'x')).toThrow(/leer/)
  })
  it('nimmt die Kurzbeschreibung oder ersatzweise den ersten Listenpunkt', () => {
    const entries = parseChangelog(CHANGELOG)
    expect(entries[0]).toEqual({ version: '0.0.2', date: '2026-09-26', summary: 'Zweite Version' })
    expect(entries[1]?.summary).toBe('Erster Punkt als Ersatz')
  })
})

describe('README-Block', () => {
  it('zeigt die letzten Versionen zwischen den Markern', () => {
    const readme = 'A\n<!-- CHANGELOG:START -->\nalt\n<!-- CHANGELOG:END -->\nB'
    const out = renderReadmeBlock(readme, parseChangelog(CHANGELOG), 1)
    expect(out).toBe('A\n<!-- CHANGELOG:START -->\n- **0.0.2** (2026-09-26): Zweite Version\n<!-- CHANGELOG:END -->\nB')
  })
})

describe('changelogSection', () => {
  it('liefert den Abschnitt einer Version ohne Überschrift', () => {
    expect(changelogSection(CHANGELOG, '0.0.2')).toBe('> Zweite Version\n\n- Punkt')
    expect(() => changelogSection(CHANGELOG, '9.9.9')).toThrow()
  })
})
