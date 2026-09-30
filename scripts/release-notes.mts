// Gibt den CHANGELOG-Abschnitt einer Version aus (Standard: Version aus package.json).
// Aufruf: node scripts/release-notes.mts [x.y.z] > notes.md
import { readFileSync } from 'node:fs'
import { changelogSection } from './release-lib.mts'

const version = process.argv[2] ?? (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version
process.stdout.write(`${changelogSection(readFileSync('CHANGELOG.md', 'utf8'), version)}\n`)
