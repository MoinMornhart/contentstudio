// Echter Abruf öffentlicher Kanal-Daten (ROADMAP 2.3) am offiziellen Kanal von YouTube selbst. Braucht Internet.
import { describe, expect, it } from 'vitest'
import { metadatenOhneSchluessel } from '../../src/main/profil/metadaten'

describe('YouTube ohne Schlüssel (echt)', () => {
  it('liefert Titel und Thumbnails der letzten Videos', async () => {
    const v = await metadatenOhneSchluessel('https://www.youtube.com/@YouTube')
    console.log(v.slice(0, 3).map((x) => `${x.veroeffentlicht.slice(0, 10)} ${x.titel}`))
    expect(v.length).toBeGreaterThan(0)
    expect(v[0]!.thumbnail).toMatch(/^https:\/\//)
  }, 60_000)
})
