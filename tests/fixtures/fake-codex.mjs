// Nachgebaute Codex-CLI für Tests: `login status` und `exec` (liest den Prompt von stdin, schreibt -o)
import { writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
if (args[0] === 'login' && args[1] === 'status') {
  const modus = process.env.FAKE_CODEX_LOGIN ?? 'chatgpt'
  if (modus === 'none') { console.error('Not logged in'); process.exit(1) }
  console.error(modus === 'apikey' ? 'Logged in using an API key - sk-***' : 'Logged in using ChatGPT')
  process.exit(0)
}
if (args[0] === 'exec') {
  let prompt = ''
  process.stdin.on('data', (d) => (prompt += d))
  process.stdin.on('end', () => {
    const o = args[args.indexOf('-o') + 1]
    // Aufruf protokollieren, damit der Test Schalter und Umgebung prüfen kann
    writeFileSync(`${o}.aufruf.json`, JSON.stringify({ args, prompt, apiKey: process.env.OPENAI_API_KEY ?? null }))
    if (process.env.FAKE_CODEX_LIMIT) {
      console.log(JSON.stringify({ type: 'turn.failed', error: { message: "You've hit your usage limit. Try again in 2 hours 5 minutes." } }))
      process.exit(1)
    }
    console.log(JSON.stringify({ type: 'thread.started' }))
    console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 30, output_tokens: 8 } }))
    writeFileSync(o, '{"ideen":[{"titel":"Aus Codex"}]}')
  })
}
