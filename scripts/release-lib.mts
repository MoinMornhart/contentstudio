// Reine Hilfsfunktionen für scripts/release.ts (ohne Dateizugriff, damit testbar).

export type Bump = 'patch' | 'minor' | 'major'

export function bumpVersion(current: string, bump: Bump | string): string {
  if (/^\d+\.\d+\.\d+$/.test(bump)) return bump
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current)
  if (!m) throw new Error(`Ungültige Version: ${current}`)
  const [major, minor, patch] = m.slice(1).map(Number) as [number, number, number]
  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
    default:
      throw new Error(`Unbekannte Erhöhung: ${bump} (patch | minor | major | x.y.z)`)
  }
}

export interface ChangelogEntry {
  version: string
  date: string
  summary: string
}

const HEADING = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})\s*$/

/**
 * Liest die Versionen aus dem CHANGELOG. Die Kurzbeschreibung ist die erste Zeile nach der
 * Überschrift, die mit `> ` beginnt; fehlt sie, dient der erste Listenpunkt als Ersatz.
 */
export function parseChangelog(text: string): ChangelogEntry[] {
  const lines = text.split(/\r?\n/)
  const entries: ChangelogEntry[] = []
  for (let i = 0; i < lines.length; i++) {
    const h = HEADING.exec(lines[i] ?? '')
    if (!h) continue
    let summary = ''
    let firstBullet = ''
    for (let j = i + 1; j < lines.length && !(lines[j] ?? '').startsWith('## '); j++) {
      const l = (lines[j] ?? '').trim()
      if (!summary && l.startsWith('> ')) summary = l.slice(2).trim()
      if (!firstBullet && l.startsWith('- ')) firstBullet = l.slice(2).trim()
    }
    entries.push({ version: h[1]!, date: h[2]!, summary: summary || firstBullet })
  }
  return entries
}

/** Macht aus `## [Unreleased]` die neue Version und legt einen leeren Unreleased-Abschnitt an. */
export function releaseUnreleased(text: string, version: string, date: string, summary: string): string {
  const marker = /^## \[Unreleased\]\s*$/m
  if (!marker.test(text)) throw new Error('CHANGELOG enthält keinen Abschnitt „## [Unreleased]“.')
  const [head, rest] = splitOnce(text, marker)
  const nextHeading = rest.search(/^## \[/m)
  const body = (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trim()
  const tail = nextHeading === -1 ? '' : rest.slice(nextHeading)
  if (!body) throw new Error('Der Abschnitt „## [Unreleased]“ ist leer – erst Änderungen eintragen.')
  return `${head}## [Unreleased]\n\n## [${version}] - ${date}\n\n> ${summary}\n\n${body}\n\n${tail}`.replace(/\n{3,}/g, '\n\n')
}

function splitOnce(text: string, re: RegExp): [string, string] {
  const m = re.exec(text)
  if (!m) return [text, '']
  return [text.slice(0, m.index), text.slice(m.index + m[0].length)]
}

/** Ersetzt den README-Block zwischen den CHANGELOG-Markern durch die letzten `count` Versionen. */
export function renderReadmeBlock(readme: string, entries: ChangelogEntry[], count = 5): string {
  const start = '<!-- CHANGELOG:START -->'
  const end = '<!-- CHANGELOG:END -->'
  const a = readme.indexOf(start)
  const b = readme.indexOf(end)
  if (a === -1 || b === -1 || b < a) throw new Error('README enthält die CHANGELOG-Marker nicht.')
  const lines = entries.slice(0, count).map((e) => `- **${e.version}** (${e.date}): ${e.summary}`)
  return `${readme.slice(0, a + start.length)}\n${lines.join('\n')}\n${readme.slice(b)}`
}


/** Text des CHANGELOG-Abschnitts einer Version (ohne Überschrift) – für GitHub-Release-Notizen. */
export function changelogSection(text: string, version: string): string {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`))
  if (start === -1) throw new Error(`Version ${version} steht nicht im CHANGELOG.`)
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((l) => l.startsWith('## '))
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim()
}
