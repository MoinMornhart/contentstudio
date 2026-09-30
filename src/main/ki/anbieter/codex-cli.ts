import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { JobContext } from '../../jobs/queue'
import { runHidden } from '../../tools/smoke'
import { commandLine } from '../cli-start'
import { t } from '../../i18n'
import { KiLimitFehler, type KiAnbieter, type KiStatus, type RohAnfrage, type RohAntwort } from '../typen'

/**
 * Umgebungsvariablen, mit denen Codex statt der ChatGPT-Anmeldung einen API-Schlüssel oder einen anderen Server nutzen
 * würde. Sie werden für jeden Codex-Kindprozess entfernt (docs/ki-anbieter.md, Abschnitt 4).
 */
export const CODEX_GESPERRT = ['OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL', 'ELECTRON_RUN_AS_NODE']

export function codexUmgebung(basis: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const gesperrt = new Set(CODEX_GESPERRT.map((k) => k.toUpperCase()))
  return Object.fromEntries(Object.entries(basis).filter(([k]) => !gesperrt.has(k.toUpperCase())))
}

/** Sucht das offizielle `codex` (PATH, npm global). Die Anmeldedaten selbst werden nie gelesen. */
export async function findeCodex(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const where = await runHidden('where.exe', ['codex'], 10_000)
  const treffer = where.code === 0 ? where.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : []
  const kandidaten = [...treffer, ...(env['APPDATA'] ? [join(env['APPDATA'], 'npm', 'codex.cmd')] : []), join(homedir(), '.local', 'bin', 'codex.exe')]
  for (const k of kandidaten) {
    if (!/\.(exe|cmd)$/i.test(k)) continue
    if ((await stat(k).catch(() => null))?.isFile()) return k
  }
  return null
}

/** Startet `codex` (auch als .cmd) ohne Fenster und sammelt die Ausgabe */
function starte(cli: string, args: string[], eingabe: string, timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const [exe, argv, verbatim] = commandLine(cli, args)
    const child = spawn(exe, argv, { env: codexUmgebung(), windowsHide: true, windowsVerbatimArguments: verbatim })
    let stdout = ''
    let stderr = ''
    const uhr = setTimeout(() => child.kill(), timeoutMs)
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')))
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')))
    child.once('error', (e) => resolve({ code: null, stdout, stderr: e.message }))
    child.once('close', (code) => {
      clearTimeout(uhr)
      resolve({ code, stdout, stderr })
    })
    child.stdin.end(eingabe)
  })
}

/** Liest aus einer Fehlermeldung, ob ein Nutzungslimit erreicht ist, und wann es weitergeht */
export function codexLimit(text: string, jetzt = new Date()): { resetAt: Date | null } | null {
  if (!/usage limit|rate limit|quota|too many requests/i.test(text)) return null
  const m = /try again (?:in|after) (?:(\d+)\s*(?:hours?|h))?\s*(?:(\d+)\s*(?:minutes?|min|m))?/i.exec(text)
  if (m && (m[1] || m[2])) return { resetAt: new Date(jetzt.getTime() + (Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60_000) }
  const uhr = /try again at ([0-9]{1,2}:[0-9]{2}\s*(?:am|pm)?)/i.exec(text)
  if (uhr) {
    const [h, min] = uhr[1]!.replace(/\s*(am|pm)/i, '').split(':').map(Number)
    const d = new Date(jetzt)
    d.setHours((h ?? 0) + (/pm/i.test(uhr[1]!) && (h ?? 0) < 12 ? 12 : 0), min ?? 0, 0, 0)
    if (d <= jetzt) d.setDate(d.getDate() + 1)
    return { resetAt: d }
  }
  return { resetAt: null }
}

/** Schalter für `codex exec`: nur lesende Sandbox, keine Sitzungsdateien, Prompt über stdin */
export function codexArgs(o: { arbeitsordner: string; schema: string | null; ausgabe: string; modell: string | null; bilder: string[] }): string[] {
  return [
    'exec',
    '--json',
    '--ephemeral',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '-C',
    o.arbeitsordner,
    '-o',
    o.ausgabe,
    ...(o.schema ? ['--output-schema', o.schema] : []),
    ...(o.modell ? ['-m', o.modell] : []),
    ...o.bilder.flatMap((b) => ['-i', b]),
    '-'
  ]
}

/**
 * ChatGPT-Abo über die offizielle, unveränderte Codex-CLI, in der sich die Person selbst angemeldet hat (`codex login`).
 * Erlaubt für lokale Open-Source-Apps (docs/ki-anbieter.md). ContentStudio liest nie `~/.codex/auth.json`, entfernt
 * API-Schlüssel-Variablen aus der Umgebung und nutzt nur eine lesende Sandbox in einem eigenen, leeren Arbeitsordner.
 */
export class CodexCli implements KiAnbieter {
  readonly id = 'codex-cli'
  readonly art = 'abo' as const
  readonly faehigkeiten = { text: true, bilderSehen: true, werkzeuge: false, jsonSchema: true, lange: true }
  private cli: string | null = null

  constructor(
    private readonly arbeitsordner: string,
    private readonly modell: () => Promise<string | null>,
    private readonly finde: () => Promise<string | null> = () => findeCodex()
  ) {}

  async pruefe(): Promise<KiStatus> {
    this.cli = await this.finde()
    if (!this.cli) return { installiert: false, bereit: false, hinweis: t('ki.codexFehlt') }
    const status = await starte(this.cli, ['login', 'status'], '', 20_000)
    const text = `${status.stdout}\n${status.stderr}`
    if (status.code === 0 && /Logged in using ChatGPT/i.test(text)) return { installiert: true, bereit: true, hinweis: null }
    if (status.code === 0) return { installiert: true, bereit: false, hinweis: t('ki.codexKeinAbo') }
    return { installiert: true, bereit: false, hinweis: t('ki.codexAnmelden') }
  }

  async frage(a: RohAnfrage, ctx?: JobContext<unknown>): Promise<RohAntwort> {
    if (!this.cli) this.cli = await this.finde()
    if (!this.cli) throw new Error(t('ki.codexFehlt'))
    await mkdir(this.arbeitsordner, { recursive: true })
    const tmp = await mkdtemp(join(this.arbeitsordner, 'auftrag-'))
    try {
      const schema = join(tmp, 'schema.json')
      await writeFile(schema, JSON.stringify(a.schema))
      const ausgabe = join(tmp, 'antwort.txt')
      const modell = await this.modell()
      const prompt = `${a.system}\n\n${a.prompt}`
      let erg = await this.lauf(this.cli, codexArgs({ arbeitsordner: tmp, schema, ausgabe, modell, bilder: a.bilder }), prompt, ctx)
      // Manche Schemas akzeptiert die strenge Ausgabe nicht: dann ohne, die Schicht prüft und repariert
      if (erg.code !== 0 && /schema/i.test(erg.fehler)) erg = await this.lauf(this.cli, codexArgs({ arbeitsordner: tmp, schema: null, ausgabe, modell, bilder: a.bilder }), prompt, ctx)
      const limit = codexLimit(erg.fehler)
      if (limit) throw new KiLimitFehler(this.id, limit.resetAt, t('ki.limit', { anbieter: 'ChatGPT' }))
      const text = await readFile(ausgabe, 'utf8').catch(() => '')
      if (erg.code !== 0 && !text) throw new Error(t('ki.codexFehler', { text: erg.fehler.slice(-300) || String(erg.code) }))
      return { text, modell, nutzung: erg.nutzung }
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  }

  private lauf(cli: string, args: string[], prompt: string, ctx?: JobContext<unknown>): Promise<{ code: number | null; fehler: string; nutzung: RohAntwort['nutzung'] }> {
    return new Promise((resolve, reject) => {
      const [exe, argv, verbatim] = commandLine(cli, args)
      const child = spawn(exe, argv, { env: codexUmgebung(), windowsHide: true, windowsVerbatimArguments: verbatim })
      ctx?.track(child)
      let rest = ''
      let fehler = ''
      let nutzung: RohAntwort['nutzung'] = null
      const zeile = (l: string): void => {
        try {
          const e = JSON.parse(l) as { type?: string; usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string }; message?: string }
          if (e.type === 'turn.completed' && e.usage) nutzung = { eingabe: e.usage.input_tokens ?? 0, ausgabe: e.usage.output_tokens ?? 0 }
          if (e.type === 'turn.failed' || e.type === 'error') fehler += `${e.error?.message ?? e.message ?? ''}\n`
        } catch {
          // keine JSON-Zeile
        }
      }
      child.stdout.on('data', (d: Buffer) => {
        const teile = (rest + d.toString('utf8')).split(/\r?\n/)
        rest = teile.pop() ?? ''
        teile.filter(Boolean).forEach(zeile)
      })
      child.stderr.on('data', (d: Buffer) => (fehler = (fehler + d.toString('utf8')).slice(-8000)))
      const abbruch = (): void => void child.kill()
      ctx?.signal.addEventListener('abort', abbruch, { once: true })
      child.once('error', reject)
      child.once('close', (code) => {
        ctx?.signal.removeEventListener('abort', abbruch)
        if (rest) zeile(rest)
        resolve({ code, fehler, nutzung })
      })
      child.stdin.end(prompt, 'utf8')
    })
  }
}
