// Herkunft: MoinStudio src/main/tools/specs.ts (MIT).
/**
 * Externe Werkzeuge, die ContentStudio selbst herunterlädt (portable, ohne Admin-Rechte).
 * Jede Quelle ist offiziell bzw. etabliert; die SHA256-Prüfsumme kommt aus der Prüfsummendatei
 * des Herstellers und wird vor dem Entpacken geprüft.
 */
import type { ToolId } from '@shared/app'

export type { ToolId } from '@shared/app'

export interface ToolSpec {
  id: ToolId
  /** Anzeigename */
  label: string
  version: string
  url: string
  /** Dateiname des Downloads (wie in der Prüfsummendatei) */
  file: string
  /** URL der Prüfsummendatei im Format „<sha256>  <dateiname>“ pro Zeile */
  checksumUrl: string
  /** Ungefähre Downloadgröße in Bytes (für Platzprüfung und Anzeige) */
  sizeBytes: number
  /** Ungefährer Platzbedarf nach dem Entpacken in Bytes */
  installedBytes: number
  /** Unterordner im Tools-Verzeichnis. Bewusst kurz wegen der Windows-Pfadgrenze (MAX_PATH). */
  dir: string
  /** Pfad zur Programmdatei relativ zum Installationsordner */
  exe: string
}

const BLENDER_BASE = 'https://download.blender.org/release'

function blender(version: string, sizeBytes: number, installedBytes: number): ToolSpec {
  const [major, minor] = version.split('.')
  const file = `blender-${version}-windows-x64.zip`
  return {
    id: 'blender',
    label: `Blender ${version}`,
    version,
    url: `${BLENDER_BASE}/Blender${major}.${minor}/${file}`,
    file,
    checksumUrl: `${BLENDER_BASE}/Blender${major}.${minor}/blender-${version}.sha256`,
    sizeBytes,
    installedBytes,
    dir: `bl\\${version}`,
    exe: 'blender.exe'
  }
}

/** Bevorzugte Blender-Version (LTS). */
export const BLENDER_PRIMARY = blender('5.2.2', 404_453_484, 1_050_000_000)
/**
 * Rückfall-Version: Cycles ab 5.0 nutzt den CPU-Befehl RDTSCP, den manche virtuellen CPUs nicht
 * melden (Absturz „ILLEGAL_INSTRUCTION“). 4.5 LTS läuft dort. Der Hardware-Test entscheidet.
 */
export const BLENDER_FALLBACK = blender('4.5.9', 370_000_000, 950_000_000)

const FFMPEG_RELEASE = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest'
export const FFMPEG: ToolSpec = {
  id: 'ffmpeg',
  label: 'FFmpeg 9.0',
  version: '9.0',
  url: `${FFMPEG_RELEASE}/ffmpeg-n9.0-latest-win64-gpl-9.0.zip`,
  file: 'ffmpeg-n9.0-latest-win64-gpl-9.0.zip',
  checksumUrl: `${FFMPEG_RELEASE}/checksums.sha256`,
  sizeBytes: 194_032_660,
  installedBytes: 520_000_000,
  dir: 'ffmpeg\\9.0',
  exe: 'bin\\ffmpeg.exe'
}

const UV_VERSION = '0.12.19'
const UV_RELEASE = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}`
export const UV: ToolSpec = {
  id: 'uv',
  label: `uv ${UV_VERSION}`,
  version: UV_VERSION,
  url: `${UV_RELEASE}/uv-x86_64-pc-windows-msvc.zip`,
  file: 'uv-x86_64-pc-windows-msvc.zip',
  checksumUrl: `${UV_RELEASE}/uv-x86_64-pc-windows-msvc.zip.sha256`,
  sizeBytes: 22_000_000,
  installedBytes: 60_000_000,
  dir: `uv\\${UV_VERSION}`,
  exe: 'uv.exe'
}

/** Werkzeuge, die jeder braucht (Schnitt, Transkript, Freistellen). Blender nur, wenn 3D gebraucht wird. */
export const GRUNDWERKZEUGE: readonly ToolSpec[] = [FFMPEG, UV]
/** Alle Werkzeuge in der Anzeige (Blender als optionales 3D-Werkzeug) */
export const WERKZEUGE: readonly ToolSpec[] = [FFMPEG, UV, BLENDER_PRIMARY]

/** Findet die Prüfsumme für `file` in einer Prüfsummendatei („<hash>  <name>“ oder „<hash> *<name>“). */
export function findChecksum(text: string, file: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-f]{64})\s+\*?(.+?)\s*$/i.exec(line.trim())
    if (m && (m[2] === file || m[2]!.endsWith(`/${file}`))) return m[1]!.toLowerCase()
  }
  // uv liefert pro Datei eine eigene .sha256 mit nur dem Hash
  const only = /^\s*([0-9a-f]{64})\s*$/i.exec(text)
  return only ? only[1]!.toLowerCase() : null
}
