// Herkunft: MoinStudio src/main/adobe/selbsttest.ts (MIT), erweitert um After Effects, DaVinci Resolve und CapCut.
import { execFile, spawn } from 'node:child_process'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { t } from '../i18n'
import { kodierePng, type RohBild } from '../bild/rohbild'
import type { Effekt } from '../schnitt/effekte'
import { exportierePsd } from '../thumbnail/export'
import { afterEffectsSkript } from './aftereffects'
import { capcutOrdner, clipName } from './capcut'
import type { ErkanntesProgramm, ProgrammId } from './erkennung'
import { premiereXml, srt, type PremiereOptionen } from './premiere'
import { resolveEdl, resolveFcpxml } from './resolve'

/**
 * Selbsttest je Programm (ROADMAP 7.5): erzeugt neutrale Proben (Testbild, nichts Privates) und prüft, was sich
 * automatisch prüfen lässt – Photoshop über COM, After Effects über sein Skript (es schreibt zurück, was es angelegt
 * hat). Premiere und Resolve lassen sich ohne Plugin nicht fernsteuern: dafür gibt es eine Checkliste mit den erwarteten
 * Werten. Ist ein Programm nicht installiert, heißt das Ergebnis „übersprungen“, nie „Fehler“.
 */

export type SelbsttestStatus = 'ok' | 'fehler' | 'übersprungen' | 'checkliste'
export interface SelbsttestErgebnis {
  id: ProgrammId
  status: SelbsttestStatus
  details: string
  /** Checkliste oder Probe zum Öffnen */
  datei: string | null
}

export const PROBE = {
  video: { dauer: 20, fps: 30, breite: 1280, hoehe: 720 },
  behalten: [
    { start: 0, ende: 5 },
    { start: 8, ende: 14 },
    { start: 16, ende: 20 }
  ],
  zooms: [{ start: 6, ende: 9 }],
  kapitel: [
    { zeit: 0, titel: 'Start' },
    { zeit: 5, titel: 'Mitte' }
  ],
  effekte: [
    { art: 'zoom', von: 1, bis: 3, faktor: 1.5, x: 0.75 },
    { art: 'text', von: 11.5, bis: 13.5, text: 'TEST', lage: 'oben' },
    { art: 'tempo', von: 12, bis: 14, faktor: 0.5 }
  ] satisfies Effekt[],
  psd: { breite: 320, hoehe: 180, ebenen: ['Hintergrund', 'Figuren', 'Text', 'Feinschliff'] },
  sequenz: 'ContentStudio Selbsttest'
} as const

const lauf = (exe: string, args: string[], timeout = 120_000): Promise<{ code: number; out: string }> =>
  new Promise((resolve) => {
    execFile(exe, args, { windowsHide: true, timeout, maxBuffer: 10_000_000 }, (err, stdout, stderr) => resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, out: `${stdout}${stderr}` }))
  })

/** Proben-Ebenen: Verlauf, Figur, Textbalken; das „fertige“ Bild ist etwas heller (wie ein Farbangleich) → Feinschliff */
export function probeBilder(breite: number, hoehe: number): { ebenen: Record<string, RohBild>; fertig: RohBild } {
  const leer = (): RohBild => ({ width: breite, height: hoehe, data: new Uint8Array(breite * hoehe * 4) })
  const hg = leer()
  const fig = leer()
  const text = leer()
  const fertig = leer()
  for (let y = 0; y < hoehe; y++)
    for (let x = 0; x < breite; x++) {
      const o = (y * breite + x) * 4
      hg.data.set([Math.round((x / breite) * 255), 80, Math.round((y / hoehe) * 255), 255], o)
      const inFig = x > breite * 0.1 && x < breite * 0.4 && y > hoehe * 0.3
      const inText = x > breite * 0.5 && x < breite * 0.95 && y > hoehe * 0.08 && y < hoehe * 0.25
      if (inFig) fig.data.set([60, 200, 60, 255], o)
      if (inText) text.data.set([255, 220, 0, 255], o)
      const px = inText ? [255, 220, 0] : inFig ? [60, 200, 60] : [hg.data[o]!, 80, hg.data[o + 2]!]
      // rechte Bildhälfte etwas heller: das erklären die Ebenen nicht
      fertig.data.set([...px.map((v) => (x > breite / 2 ? Math.min(255, v + 12) : v)), 255], o)
    }
  return { ebenen: { 'hintergrund.png': hg, 'person-Figuren.png': fig, 'text.png': text }, fertig }
}

export interface Proben {
  ordner: string
  video: string
  premiere: string
  resolve: string
  edl: string
  aftereffects: string
  aeErgebnis: string
  capcut: string
  psd: string
  optionen: PremiereOptionen
}

/** Schreibt Testvideo und je Programm eine Probe in `ordner` (lokal, nicht im geteilten Datenordner). */
export async function erzeugeProben(ordner: string, ffmpeg: string): Promise<Proben> {
  await mkdir(ordner, { recursive: true })
  const v = PROBE.video
  const video = join(ordner, 'testvideo.mp4')
  const r = await lauf(ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${v.breite}x${v.hoehe}:rate=${v.fps}`, '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', String(v.dauer), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ac', '2', video])
  if (r.code !== 0) throw new Error(t('programme.fehler.testvideo', { grund: r.out.trim().slice(-300) }))
  const liste = { version: 1 as const, dauer: v.dauer, behalten: PROBE.behalten.map((b) => ({ ...b })), entfernt: [] }
  const optionen: PremiereOptionen = { name: PROBE.sequenz, quelle: { pfad: video, ...v, audio: true }, liste, zooms: PROBE.zooms.map((z) => ({ ...z })), kapitel: PROBE.kapitel.map((k) => ({ ...k })), effekte: PROBE.effekte.map((e) => ({ ...e })) }
  const zeilen = [
    { start: 0.5, ende: 2.5, text: 'Erster Untertitel' },
    { start: 6, ende: 8, text: 'Zweiter Untertitel' },
    { start: 12, ende: 14, text: 'Dritter Untertitel' }
  ]
  await writeFile(join(ordner, 'untertitel.srt'), srt(zeilen))
  const p: Proben = {
    ordner,
    video,
    premiere: join(ordner, 'premiere.xml'),
    resolve: join(ordner, 'resolve.fcpxml'),
    edl: join(ordner, 'resolve.edl'),
    aftereffects: join(ordner, 'aftereffects.jsx'),
    aeErgebnis: join(ordner, 'aftereffects-ergebnis.json'),
    capcut: join(ordner, 'capcut'),
    psd: join(ordner, 'ebenen.psd'),
    optionen
  }
  await writeFile(p.premiere, premiereXml(optionen))
  await writeFile(p.resolve, resolveFcpxml(optionen))
  await writeFile(p.edl, resolveEdl(optionen))
  await writeFile(p.aftereffects, afterEffectsSkript({ ...optionen, ergebnis: p.aeErgebnis }))
  await rm(p.capcut, { recursive: true, force: true })
  await capcutOrdner({ quelle: video, behalten: liste.behalten, untertitel: zeilen, kapitel: optionen.kapitel, effekte: optionen.effekte ?? [], titel: PROBE.sequenz, ziel: p.capcut, ffmpeg })
  // PSD aus Proben-Ebenen, mit dem gleichen Weg wie beim Thumbnail-Export
  const { ebenen, fertig } = probeBilder(PROBE.psd.breite, PROBE.psd.hoehe)
  await mkdir(join(ordner, 'ebenen'), { recursive: true })
  for (const [name, bild] of Object.entries(ebenen)) await writeFile(join(ordner, 'ebenen', name), kodierePng(bild))
  await writeFile(join(ordner, 'fertig.png'), kodierePng(fertig))
  await exportierePsd(join(ordner, 'fertig.png'), join(ordner, 'ebenen'), p.psd)
  return p
}

const frames = (): number => PROBE.behalten.reduce((s, b) => s + Math.round(b.ende * PROBE.video.fps) - Math.round(b.start * PROBE.video.fps), 0)

/** Photoshop per COM: PSD öffnen, Größe und Ebenen vergleichen, ohne Speichern schließen. */
export async function pruefePhotoshop(psd: string): Promise<{ status: SelbsttestStatus; details: string }> {
  const skript = `
$ErrorActionPreference = 'Stop'
try { $ps = New-Object -ComObject Photoshop.Application } catch { Write-Output 'CS_PS_FEHLT'; exit 0 }
$alt = $ps.Preferences.RulerUnits
$ps.Preferences.RulerUnits = 1
$ps.DisplayDialogs = 3
try {
  $doc = $ps.Open('${psd.replace(/'/g, "''")}')
  $namen = @()
  foreach ($l in $doc.ArtLayers) { $namen += $l.Name }
  [array]::Reverse($namen)
  Write-Output ('CS_PS ' + (@{ breite = [int]$doc.Width; hoehe = [int]$doc.Height; ebenen = $namen } | ConvertTo-Json -Compress))
  $doc.Close(2)
} finally { $ps.Preferences.RulerUnits = $alt }
`
  const r = await lauf('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', skript], 180_000)
  if (r.out.includes('CS_PS_FEHLT')) return { status: 'übersprungen', details: t('programme.test.fehlt') }
  const m = /CS_PS (\{.*\})/.exec(r.out)
  if (!m) return { status: 'fehler', details: t('programme.test.psNichtGeoeffnet', { grund: r.out.trim().slice(-300) }) }
  const ist = JSON.parse(m[1]!) as { breite: number; hoehe: number; ebenen: string[] | string }
  const ebenen = Array.isArray(ist.ebenen) ? ist.ebenen : [ist.ebenen]
  const e = PROBE.psd
  const ok = ist.breite === e.breite && ist.hoehe === e.hoehe && JSON.stringify(ebenen) === JSON.stringify(e.ebenen)
  return { status: ok ? 'ok' : 'fehler', details: t('programme.test.ps', { breite: ist.breite, hoehe: ist.hoehe, ebenen: ebenen.join(', '), erwartet: `${e.breite}×${e.hoehe}, ${e.ebenen.join(', ')}` }) }
}

/** After Effects führt das Skript aus (AfterFX.exe -r) und schreibt zurück, was es angelegt hat. */
export async function pruefeAfterEffects(exe: string, p: Proben, warte = 240_000): Promise<{ status: SelbsttestStatus; details: string }> {
  await rm(p.aeErgebnis, { force: true })
  const kind = spawn(exe, ['-r', p.aftereffects], { detached: true, stdio: 'ignore', windowsHide: false })
  kind.unref()
  for (let i = 0; i < warte / 2000; i++) {
    const text = await readFile(p.aeErgebnis, 'utf8').catch(() => null)
    if (text) {
      const e = JSON.parse(text) as { komposition: string; passt: boolean; breite: number; hoehe: number; dauer: number; ebenen: number; marken: number }
      const erwartetMarken = PROBE.kapitel.length + PROBE.effekte.length
      const ok = e.passt && e.breite === PROBE.video.breite && e.hoehe === PROBE.video.hoehe && e.ebenen === PROBE.behalten.length + 1 && e.marken === erwartetMarken && Math.abs(e.dauer - frames() / PROBE.video.fps) < 0.1
      return { status: ok ? 'ok' : 'fehler', details: t('programme.test.ae', { name: e.komposition, ebenen: e.ebenen, marken: e.marken, dauer: e.dauer.toFixed(1) }) }
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  return { status: 'fehler', details: t('programme.test.aeZeit') }
}

/** CapCut-Ordner: jedes Stück als Clip, Untertitel, Liste, Anleitung */
export async function pruefeCapcutOrdner(ordner: string): Promise<boolean> {
  const dateien = [...PROBE.behalten.map((_, i) => join('clips', clipName(i))), 'untertitel.srt', 'liste.txt', 'anleitung.txt']
  for (const d of dateien) if (!((await stat(join(ordner, d)).catch(() => null))?.size ?? 0)) return false
  return true
}

export function checkliste(id: 'premiere' | 'resolve' | 'capcut', p: Proben): string {
  const sek = (frames() / PROBE.video.fps).toFixed(0)
  const vars = { ordner: p.ordner, sequenz: PROBE.sequenz, sekunden: sek, clips: PROBE.behalten.length, marker: PROBE.kapitel.map((k) => k.titel).join(', ') }
  return t(`programme.checkliste.${id}`, vars)
}

/** Selbsttest eines Programms; `gefunden` = Ergebnis der Erkennung */
export async function selbsttest(id: ProgrammId, gefunden: ErkanntesProgramm[], proben: () => Promise<Proben>): Promise<SelbsttestErgebnis> {
  const programm = gefunden.find((g) => g.id === id)
  if (!programm) return { id, status: 'übersprungen', details: t('programme.test.fehlt'), datei: null }
  const p = await proben()
  if (id === 'photoshop') return { id, ...(await pruefePhotoshop(p.psd)), datei: p.psd }
  if (id === 'aftereffects') return { id, ...(await pruefeAfterEffects(programm.pfad, p)), datei: p.aftereffects }
  if (id === 'capcut' && !(await pruefeCapcutOrdner(p.capcut))) return { id, status: 'fehler', details: t('programme.test.capcutUnvollstaendig'), datei: p.capcut }
  const datei = join(p.ordner, `${id}-checkliste.md`)
  await writeFile(datei, checkliste(id, p))
  return { id, status: 'checkliste', details: t('programme.test.checkliste'), datei }
}
