// Echter Auftrag über einen lokalen llama.cpp-Server (ROADMAP 3.4). Braucht `llama-server` auf 127.0.0.1:8080; sonst
// wird der Test übersprungen. Modell beliebig (auf der Test-VM: Qwen2.5 0,5B Instruct, Apache-2.0).
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { OpenAiKompatibel } from '../../src/main/ki/anbieter/openai-kompatibel'
import { KiSchicht } from '../../src/main/ki/schicht'

const laeuft = await fetch('http://127.0.0.1:8080/v1/models', { signal: AbortSignal.timeout(2000) }).then(
  (r) => r.ok,
  () => false
)

describe.skipIf(!laeuft)('lokales Modell über llama.cpp (echt)', () => {
  it('liefert gültiges JSON nach Schema über die KI-Schicht', async () => {
    const lokal = new OpenAiKompatibel({ id: 'llamacpp', art: 'lokal', name: 'llama.cpp', basis: 'http://127.0.0.1:8080/v1', schluessel: async () => null, modell: async () => null })
    const schicht = new KiSchicht(new Map([['llamacpp', lokal]]), async () => [{ id: 'llamacpp', aktiv: true }])
    const Ideen = z.object({ ideen: z.array(z.object({ titel: z.string().min(3), warum: z.string() })).min(3).max(5) })
    const t0 = Date.now()
    const e = await schicht.frage({
      name: 'test-ideen',
      system: 'You plan videos for a cooking channel. Answer in German.',
      prompt: 'Give 3 video ideas for quick weekday dinners.',
      schema: Ideen,
      stufe: 'schnell',
      maxAusgabe: 600
    })
    console.log(`${(Date.now() - t0) / 1000}s, Reparaturen: ${e.reparaturen}, Modell: ${e.modell}`)
    console.log(e.daten.ideen.map((i) => `- ${i.titel}`).join('\n'))
    expect(e.anbieter).toBe('llamacpp')
    expect(e.daten.ideen.length).toBeGreaterThanOrEqual(3)
    expect(e.kostenUsd).toBeNull()
  }, 300_000)
})
