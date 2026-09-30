import { describe, expect, it } from 'vitest'
import { gueltigerName, skinAusName, texturAusProfil } from '../../src/main/profil/skinname'

const profil = (model?: string): { properties: { name: string; value: string }[] } => ({
  properties: [
    {
      name: 'textures',
      value: Buffer.from(JSON.stringify({ textures: { SKIN: { url: 'http://textures.minecraft.net/texture/abc', ...(model ? { metadata: { model } } : {}) } } })).toString('base64')
    }
  ]
})

describe('Skin per Minecraft-Name', () => {
  it('prüft Namen wie Minecraft', () => {
    expect(gueltigerName('Beispiel_Kim')).toBe(true)
    expect(gueltigerName('ab')).toBe(false)
    expect(gueltigerName('mit leerzeichen')).toBe(false)
  })

  it('liest Skin-Adresse und Armform aus dem Profil', () => {
    expect(texturAusProfil(profil('slim'))).toEqual({ url: 'https://textures.minecraft.net/texture/abc', slim: true })
    expect(texturAusProfil(profil())).toEqual({ url: 'https://textures.minecraft.net/texture/abc', slim: false })
    expect(texturAusProfil({ properties: [] })).toBeNull()
  })

  it('holt Name → UUID → Profil → PNG und meldet unbekannte Namen verständlich', async () => {
    const antworten: Record<string, Response> = {
      'https://api.mojang.com/users/profiles/minecraft/Test_Alex': Response.json({ id: 'uuid1', name: 'Test_Alex' }),
      'https://sessionserver.mojang.com/session/minecraft/profile/uuid1': Response.json(profil('slim')),
      'https://textures.minecraft.net/texture/abc': new Response(new Uint8Array([137, 80, 78, 71]))
    }
    const holen = (async (url: string) => antworten[url] ?? new Response(null, { status: 404 })) as typeof fetch
    const s = await skinAusName('Test_Alex', holen)
    expect(s).toMatchObject({ name: 'Test_Alex', uuid: 'uuid1', slim: true })
    expect(s.png.subarray(0, 4)).toEqual(Buffer.from([137, 80, 78, 71]))
    await expect(skinAusName('GibtsNicht123', holen)).rejects.toThrow('gibt es nicht')
  })
})
