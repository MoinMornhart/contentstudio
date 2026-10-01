// Nur für Tests auf dem eigenen Rechner: das eigene, unveränderte Claude Code (`claude -p`) mit dem eigenen Abo als
// KI-Weg der Freiform-Läufe (ROADMAP 8.1). Nicht in der App: docs/ki-anbieter.md erklärt, warum ContentStudio diesen Weg
// ohne Freigabe von Anthropic nicht anbietet. Aufrufmuster wie in MoinStudio (src/main/claude/run.ts).
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { KiAnbieter, RohAnfrage, RohAntwort } from '../../src/main/ki/typen'

/** claude.exe: CS_CLAUDE_CLI, sonst die neueste Claude-Code-Erweiterung von VS Code */
export function findeClaude(): string | null {
  if (process.env['CS_CLAUDE_CLI'] && existsSync(process.env['CS_CLAUDE_CLI'])) return process.env['CS_CLAUDE_CLI']
  const ext = join(homedir(), '.vscode', 'extensions')
  const ordner = existsSync(ext) ? readdirSync(ext).filter((n) => n.startsWith('anthropic.claude-code-')).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })) : []
  for (const o of ordner) {
    const exe = join(ext, o, 'resources', 'native-binary', 'claude.exe')
    if (existsSync(exe)) return exe
  }
  return null
}

/** Die CLI prüft Schemas ohne Meta-Schema-Verweis ($schema auf Draft 2020-12 kennt sie nicht) */
function ohneMeta(schema: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _weg, ...rest } = schema
  void _weg
  return rest
}

export class ClaudeCliTest implements KiAnbieter {
  readonly id = 'claude-cli'
  readonly art = 'abo' as const
  faehigkeiten = { text: true, bilderSehen: true, werkzeuge: false, jsonSchema: true, lange: true }
  private readonly arbeit = join(tmpdir(), 'cs-claude-arbeit')

  constructor(
    private readonly exe: string,
    private readonly modell: string | null = null
  ) {
    mkdirSync(this.arbeit, { recursive: true })
  }

  async pruefe(): Promise<{ installiert: boolean; bereit: boolean; hinweis: string | null }> {
    return { installiert: existsSync(this.exe), bereit: existsSync(this.exe), hinweis: null }
  }

  frage(a: RohAnfrage): Promise<RohAntwort> {
    // Bilder sieht Claude über das Lese-Werkzeug; sonst keine Werkzeuge
    const ordner = [...new Set(a.bilder.map((b) => dirname(b)))]
    const args = ['-p', '--output-format', 'json', '--permission-mode', 'dontAsk', '--strict-mcp-config', '--max-turns', a.bilder.length ? '8' : '3', '--json-schema', JSON.stringify(ohneMeta(a.schema)), '--append-system-prompt', a.system, '--tools', a.bilder.length ? 'Read' : '']
    if (a.bilder.length) args.push('--allowedTools', 'Read', ...ordner.flatMap((o) => ['--add-dir', o]))
    if (this.modell) args.push('--model', this.modell)
    const prompt = a.bilder.length ? `Sieh dir zuerst diese Bilder mit dem Read-Werkzeug an:\n${a.bilder.map((b) => `- ${b}`).join('\n')}\n\n${a.prompt}` : a.prompt
    const env = { ...process.env }
    delete env['CLAUDECODE']
    return new Promise((resolve, reject) => {
      const kind = spawn(this.exe, args, { cwd: this.arbeit, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
      let aus = ''
      let fehler = ''
      kind.stdout.on('data', (d: Buffer) => (aus += d.toString()))
      kind.stderr.on('data', (d: Buffer) => (fehler = (fehler + d.toString()).slice(-2000)))
      kind.once('error', reject)
      kind.once('exit', () => {
        try {
          const j = JSON.parse(aus) as { is_error?: boolean; subtype?: string; result?: string; structured_output?: unknown; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }; modelUsage?: Record<string, unknown> }
          if (j.is_error) return reject(new Error(`claude: ${j.subtype ?? 'Fehler'} ${String(j.result ?? '').slice(0, 300)}`))
          const u = j.usage ?? {}
          resolve({
            text: j.result ?? JSON.stringify(j.structured_output ?? ''),
            strukturiert: j.structured_output,
            modell: Object.keys(j.modelUsage ?? {})[0] ?? null,
            nutzung: { eingabe: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), ausgabe: u.output_tokens ?? 0 }
          })
        } catch {
          reject(new Error(`claude antwortete nicht lesbar: ${(fehler || aus).trim().slice(-300)}`))
        }
      })
      kind.stdin.end(prompt)
    })
  }
}
