// Gemeinsame Hilfen der echten Tests: Werkzeuge aus CONTENTSTUDIO_TOOLS_DIR, Auftrags-Kontext, Testvideos aus der
// Windows-Sprachausgabe (Sprechtext mit Pausen, dazu ein wanderndes weißes Quadrat als Bild).
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { JobContext } from '../../src/main/jobs/queue'
import type { ThumbUmgebung } from '../../src/main/thumbnail/umgebung'

export const ROOT = process.env['CONTENTSTUDIO_TOOLS_DIR'] ?? join(process.env['LOCALAPPDATA'] ?? '', 'ContentStudio')
export const TEST_ECHT = join(process.env['LOCALAPPDATA'] ?? '', 'ContentStudio', 'test-echt')
const FF_DIR = readdirSync(join(ROOT, 'ffmpeg')).map((v) => join(ROOT, 'ffmpeg', v, 'bin')).find((d) => existsSync(join(d, 'ffmpeg.exe')))!
export const FFMPEG = join(FF_DIR, 'ffmpeg.exe')
export const FFPROBE = join(FF_DIR, 'ffprobe.exe')
export const UV = readdirSync(join(ROOT, 'uv')).map((v) => join(ROOT, 'uv', v, 'uv.exe')).find(existsSync)!
export const PY_DIR = join(ROOT, 'py', 'vorlage')
export const SKRIPTE = join(__dirname, '..', '..', 'blender')
export const BLENDER = ['4.5.9', '5.2.2'].map((v) => join(ROOT, 'bl', v, 'blender.exe')).find(existsSync) ?? null

export const umgebung: ThumbUmgebung = {
  blender: BLENDER ? { exe: BLENDER, mesa: true, geraet: 'CPU', samples: 16 } : null,
  uv: UV,
  pyDir: PY_DIR,
  modelle: join(ROOT, 'py', 'modelle'),
  skripte: SKRIPTE,
  prompts: join(__dirname, '..', '..', 'resources', 'prompts'),
  werkzeugRoot: ROOT,
  mojangErlaubt: false
}

export function ctx(melde = false): JobContext<never> {
  let cp: unknown
  return {
    id: 'test',
    get checkpoint() {
      return cp as never
    },
    save: async (c: unknown) => void (cp = c),
    progress: (p: number | null, s: string) => melde && console.log(`  ${p ?? '…'} % ${s}`),
    yield: async () => undefined,
    signal: new AbortController().signal,
    track: () => undefined,
    waitUntil: () => {
      throw new Error('limit')
    }
  } as unknown as JobContext<never>
}

export const dauerVon = (datei: string): number => Number(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', datei]).toString())

const STIMMEN: Record<string, { stimme: string; kultur: string }> = { de: { stimme: 'Microsoft Hedda Desktop', kultur: 'de-DE' }, en: { stimme: 'Microsoft Zira Desktop', kultur: 'en-US' } }

/** Sprechtext (Texte und Pausen in Sekunden) mit der Windows-Sprachausgabe als WAV */
export function sprachDatei(sprache: string, teile: readonly (string | number)[], wav: string): void {
  const { stimme, kultur } = STIMMEN[sprache] ?? STIMMEN['de']!
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${kultur}">${teile.map((x) => (typeof x === 'number' ? `<break time="${Math.round(x * 1000)}ms"/>` : x.replace(/&/g, '&amp;'))).join(' ')}</speak>`
  const ps1 = wav.replace(/\.wav$/, '.ps1')
  // Windows PowerShell 5.1 liest Skripte ohne BOM als ANSI – Umlaute brauchen das BOM
  writeFileSync(ps1, `\ufeffAdd-Type -AssemblyName System.Speech\n$s = New-Object System.Speech.Synthesis.SpeechSynthesizer\n$s.SelectVoice('${stimme}')\n$s.SetOutputToWaveFile('${wav}')\n$s.SpeakSsml(@'\n${ssml}\n'@)\n$s.Dispose()\n`, 'utf8')
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1])
}

/** Video 1920×1080 mit weißem Quadrat, das von links nach rechts wandert, und der Sprache als Ton */
export function testVideo(wav: string, mp4: string): void {
  const d = dauerVon(wav)
  execFileSync(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=0x1c2530:s=1920x1080:r=30:d=${d.toFixed(2)}`, '-f', 'lavfi', '-i', 'color=c=white:s=220x220:r=30', '-i', wav, '-filter_complex', `[0:v][1:v]overlay=x='80+(W-380)*t/${d.toFixed(2)}':y=430:shortest=1,format=yuv420p[v]`, '-map', '[v]', '-map', '2:a', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-c:a', 'aac', '-shortest', mp4])
}
