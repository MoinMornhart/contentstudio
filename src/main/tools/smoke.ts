import { execFile } from 'node:child_process'
import type { ToolId } from './specs'

export interface SmokeResult {
  ok: boolean
  /** Erkannte Version oder Fehlermeldung */
  detail: string
  ms: number
}

/** Führt ein Programm unsichtbar aus und liefert Ausgabe und Exit-Code (ohne zu werfen). */
export function runHidden(
  exe: string,
  args: string[],
  timeoutMs: number,
  env?: NodeJS.ProcessEnv
): Promise<{ code: number | null; stdout: string; stderr: string; ms: number }> {
  const start = Date.now()
  return new Promise((resolve) => {
    execFile(
      exe,
      args,
      { windowsHide: true, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, env: env ?? process.env },
      (err, stdout, stderr) => {
        const code = err ? (typeof err.code === 'number' ? err.code : null) : 0
        resolve({ code, stdout: String(stdout), stderr: String(stderr), ms: Date.now() - start })
      }
    )
  })
}

/**
 * Minimaler Starttest je Werkzeug: startet es ohne Fenster und liest die Version.
 * (Render-Leistung misst erst der Hardware-Test.)
 */
export async function smokeTest(id: ToolId, exe: string): Promise<SmokeResult> {
  switch (id) {
    case 'blender': {
      const r = await runHidden(
        exe,
        ['-b', '--factory-startup', '--python-expr', "import bpy; print('CS_OK', bpy.app.version_string)"],
        120_000
      )
      const m = /CS_OK (\S+)/.exec(r.stdout)
      return m ? { ok: true, detail: m[1]!, ms: r.ms } : { ok: false, detail: tail(r.stderr || r.stdout), ms: r.ms }
    }
    case 'ffmpeg': {
      const r = await runHidden(exe, ['-hide_banner', '-version'], 30_000)
      const m = /ffmpeg version (\S+)/.exec(r.stdout)
      return m ? { ok: true, detail: m[1]!, ms: r.ms } : { ok: false, detail: tail(r.stderr), ms: r.ms }
    }
    case 'uv': {
      const r = await runHidden(exe, ['--version'], 30_000)
      const m = /uv (\S+)/.exec(r.stdout)
      return m ? { ok: true, detail: m[1]!, ms: r.ms } : { ok: false, detail: tail(r.stderr), ms: r.ms }
    }
  }
}

function tail(text: string): string {
  return text.trim().split(/\r?\n/).slice(-3).join(' | ') || 'keine Ausgabe'
}
