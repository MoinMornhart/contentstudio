import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DeviceProfile } from '@shared/hardware'
import { t } from '../i18n'

/**
 * Leistungsbericht (ROADMAP 8.4): misst auf diesem Rechner, was ContentStudio im Alltag tut – Export mit dem gewählten
 * Encoder und zum Vergleich mit dem Prozessor, Spracherkennung mit dem gewählten Whisper-Modell – und schreibt dazu die
 * Blender-Messungen und Entscheidungen aus dem Hardware-Test. Ergebnis ist eine Markdown-Datei zum Weitergeben; es werden
 * keine Werkzeuge nachinstalliert (fehlt etwas, steht „übersprungen“ im Bericht).
 */

export interface LeistungsSchritt {
  name: string
  sekunden: number | null
  wert: string
}

export interface LeistungsEingabe {
  ordner: string
  ffmpeg: string | null
  profil: DeviceProfile | null
  /** Python der Bild-/Sprachumgebung mit faster-whisper (null = übersprungen) */
  python: string | null
  whisperSkript: string
  whisperModelle: string
  version: string
  melde?: (prozent: number, schritt: string) => void
}

const lauf = (exe: string, args: string[], timeout = 15 * 60_000): Promise<{ ok: boolean; sekunden: number; aus: string }> =>
  new Promise((resolve) => {
    const t0 = Date.now()
    execFile(exe, args, { windowsHide: true, timeout, maxBuffer: 20_000_000 }, (err, stdout, stderr) => resolve({ ok: !err, sekunden: (Date.now() - t0) / 1000, aus: `${stdout}${stderr}` }))
  })

const rund = (s: number): number => Math.round(s * 10) / 10

/** Sprechprobe (20 s) mit der Windows-Sprachausgabe; null, wenn keine Stimme vorhanden ist */
async function sprechprobe(wav: string): Promise<boolean> {
  const text = 'Hello and welcome. This is a short speech sample for the performance report. ContentStudio measures how fast your computer turns speech into text. One, two, three, four, five. Thank you for listening and have a nice day.'
  const skript = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile('${wav.replace(/'/g, "''")}'); $s.Speak('${text}'); $s.Dispose()`
  const r = await lauf('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', skript], 60_000)
  return r.ok && existsSync(wav)
}

export async function leistungsbericht(o: LeistungsEingabe): Promise<{ datei: string; schritte: LeistungsSchritt[] }> {
  await mkdir(o.ordner, { recursive: true })
  const schritte: LeistungsSchritt[] = []
  const melde = o.melde ?? (() => undefined)
  const encoder = o.profil?.config.encoder ?? 'libx264'

  // 1. Export: 20 s Full HD mit Ton, einmal mit dem gewählten Encoder, einmal mit dem Prozessor
  if (o.ffmpeg) {
    for (const [i, enc] of [...new Set([encoder, 'libx264'])].entries()) {
      melde(10 + i * 20, t('leistung.schritt.export', { encoder: enc }))
      const r = await lauf(o.ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '20', '-c:v', enc, ...(enc === 'libx264' ? ['-preset', 'medium', '-crf', '20'] : ['-b:v', '8M']), '-pix_fmt', 'yuv420p', '-c:a', 'aac', join(o.ordner, `export-${enc}.mp4`)])
      schritte.push({ name: t('leistung.export', { encoder: enc }), sekunden: r.ok ? rund(r.sekunden) : null, wert: r.ok ? t('leistung.echtzeit', { faktor: rund(20 / r.sekunden) }) : t('leistung.fehlgeschlagen') })
    }
  } else schritte.push({ name: t('leistung.export', { encoder }), sekunden: null, wert: t('leistung.uebersprungen') })

  // 2. Spracherkennung: 20 s Sprechprobe mit dem Modell aus dem Hardware-Test
  const whisper = o.profil?.config.whisper ?? { model: 'small', device: 'cpu', compute: 'int8' }
  const wav = join(o.ordner, 'sprechprobe.wav')
  if (o.python && o.ffmpeg && (await sprechprobe(wav))) {
    melde(55, t('leistung.schritt.whisper', { modell: whisper.model }))
    const ziel = join(o.ordner, 'sprechprobe.jsonl')
    const r = await lauf(o.python, [o.whisperSkript, wav, ziel, whisper.model, whisper.device, whisper.compute, o.ffmpeg, '20', `--modelle=${o.whisperModelle}`, '--sprache=en', '--begriffe='])
    const woerter = r.ok ? (await readFile(ziel, 'utf8').catch(() => '')).split(/\r?\n/).filter(Boolean).length : 0
    schritte.push({ name: t('leistung.whisper', { modell: whisper.model, geraet: whisper.device }), sekunden: r.ok ? rund(r.sekunden) : null, wert: r.ok ? t('leistung.whisperWert', { faktor: rund(r.sekunden / 20), abschnitte: woerter }) : t('leistung.fehlgeschlagen') })
  } else schritte.push({ name: t('leistung.whisper', { modell: whisper.model, geraet: whisper.device }), sekunden: null, wert: t('leistung.uebersprungen') })

  melde(90, t('leistung.schritt.bericht'))
  const p = o.profil
  const hw = p?.hardware
  const zeilen = [
    `# ${t('leistung.titel')}`,
    '',
    `ContentStudio ${o.version} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
    '',
    `## ${t('leistung.geraet')}`,
    '',
    hw ? `- ${hw.os}\n- CPU: ${hw.cpuModel} (${hw.cpuThreads} Threads), RAM ${hw.ramGB} GB\n- GPU: ${hw.gpus.map((g) => `${g.name}${g.physical ? '' : ' (virtuell)'}`).join(', ') || '–'}` : `- ${t('leistung.keinProfil')}`,
    '',
    `## ${t('leistung.entscheidungen')}`,
    '',
    p ? `- Blender: ${p.config.blenderVersion ?? '–'}${p.config.blenderMesa ? ' (Software-OpenGL)' : ''}, ${p.config.final.engine}/${p.config.final.device}, ${p.config.final.width}×${p.config.final.height}, ${p.config.final.samples} Samples${p.config.finalSecondsEstimate ? `, ≈ ${Math.round(p.config.finalSecondsEstimate)} s je Endbild` : ''}\n- Encoder: ${p.config.encoder}\n- Whisper: ${p.config.whisper.model} (${p.config.whisper.device}, ${p.config.whisper.compute})\n- ONNX: ${p.config.onnx}` : `- ${t('leistung.keinProfil')}`,
    '',
    `## ${t('leistung.messungen')}`,
    '',
    `| ${t('leistung.aufgabe')} | ${t('leistung.sekunden')} | ${t('leistung.ergebnis')} |`,
    '|---|---|---|',
    ...schritte.map((s) => `| ${s.name} | ${s.sekunden ?? '–'} | ${s.wert} |`),
    ...(p?.renders ?? []).map((r) => `| Blender ${r.blender} ${r.engine}/${r.device} | ${r.ok && r.seconds !== null ? rund(r.seconds) : '–'} | ${r.ok ? t('leistung.render') : (r.reason ?? t('leistung.fehlgeschlagen'))} |`),
    ''
  ]
  const datei = join(o.ordner, `leistungsbericht-${new Date().toISOString().slice(0, 10)}.md`)
  await writeFile(datei, zeilen.join('\n'))
  melde(100, t('jobs.schritt.fertig'))
  return { datei, schritte }
}
