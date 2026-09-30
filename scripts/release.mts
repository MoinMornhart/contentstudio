// Release-Werkzeug: Version erhöhen, CHANGELOG abschließen, README „Neueste Änderungen“
// aktualisieren, committen, taggen und pushen (gitleaks läuft im pre-push-Hook).
//
// Ablauf: Änderungen unter „## [Unreleased]“ im CHANGELOG eintragen, dann z. B.
//   node scripts/release.mts patch --summary "Kurzbeschreibung" --message "feat: …" --trailer "Co-Authored-By: …"
// Optionen: --dry-run (nichts schreiben), --no-push, --skip-check (Prüfkette überspringen – nur im Notfall)
import { execFileSync, execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { bumpVersion, parseChangelog, releaseUnreleased, renderReadmeBlock } from './release-lib.mts'

const args = process.argv.slice(2)
const flag = (name: string): boolean => args.includes(name)
const values = (name: string): string[] =>
  args.flatMap((a, i) => (a === name && args[i + 1] !== undefined ? [args[i + 1]!] : []))
const value = (name: string): string | undefined => values(name)[0]

const bump = args[0]
const summary = value('--summary')
const message = value('--message')
if (!bump || bump.startsWith('--') || !summary || !message) {
  console.error('Aufruf: node scripts/release.mts <patch|minor|major|x.y.z> --summary "…" --message "type: …" [--trailer "…"] [--dry-run] [--no-push]')
  process.exit(2)
}

const dryRun = flag('--dry-run')

// Sicherung: Nie mit roter Prüfkette veröffentlichen (Typen, Lint, Tests, Build).
if (!dryRun && !flag('--skip-check')) {
  console.log('Prüfe vor dem Release: npm run check …')
  try {
    execSync('npm run check', { stdio: ['ignore', 'ignore', 'inherit'] })
  } catch {
    console.error('Abbruch: npm run check ist fehlgeschlagen – nichts veröffentlicht.')
    process.exit(1)
  }
}
const git = (...a: string[]): string => execFileSync('git', a, { encoding: 'utf8' }).trim()
const write = (path: string, text: string): void => {
  if (!dryRun) writeFileSync(path, text.replace(/\r\n/g, '\n'), 'utf8')
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
const version = bumpVersion(pkg.version, bump)
const date = new Date().toISOString().slice(0, 10)

const changelog = releaseUnreleased(readFileSync('CHANGELOG.md', 'utf8'), version, date, summary)
const readme = renderReadmeBlock(readFileSync('README.md', 'utf8'), parseChangelog(changelog))
const pkgText = readFileSync('package.json', 'utf8').replace(/"version":\s*"[^"]+"/, `"version": "${version}"`)
const lockText = readFileSync('package-lock.json', 'utf8').replace(
  /^(\{\s*"name":\s*"contentstudio",\s*"version":\s*")[^"]+(")/,
  `$1${version}$2`
).replace(/("packages":\s*\{\s*"":\s*\{\s*"name":\s*"contentstudio",\s*"version":\s*")[^"]+(")/, `$1${version}$2`)

console.log(`Version ${pkg.version} → ${version} (${date}): ${summary}`)
if (dryRun) {
  console.log('--dry-run: keine Dateien geändert, kein Commit.')
  process.exit(0)
}

write('CHANGELOG.md', changelog)
write('README.md', readme)
write('package.json', pkgText)
write('package-lock.json', lockText)

const trailers = values('--trailer')
const fullMessage = trailers.length ? `${message}\n\n${trailers.join('\n')}` : message
git('add', 'CHANGELOG.md', 'README.md', 'package.json', 'package-lock.json')
execFileSync('git', ['commit', '-q', '-F', '-'], { input: fullMessage, stdio: ['pipe', 'inherit', 'inherit'] })
git('tag', '-a', `v${version}`, '-m', `v${version}`)
console.log(`Commit und Tag v${version} erstellt.`)

if (!flag('--no-push')) {
  git('pull', '-q', '--rebase', 'origin', 'main')
  // Nach einem Rebase zeigt der Tag evtl. auf den alten Commit – neu setzen.
  git('tag', '-f', '-a', `v${version}`, '-m', `v${version}`, 'HEAD')
  execFileSync('git', ['push', '-q', 'origin', 'main', `v${version}`], { stdio: 'inherit' })
  console.log(`Gepusht: main + v${version}`)
}
