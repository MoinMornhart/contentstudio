// Herkunft: MoinStudio src/main/thumbnail/skinname.ts (MIT), Meldungen übersetzbar.
import { t } from '../i18n'

/**
 * Skin per Minecraft-Name. Öffentliche Mojang-Schnittstellen, ohne Anmeldung:
 * Name → UUID → Profil mit Skin-Adresse und Armform (slim).
 */

export interface SkinAusName {
  name: string
  uuid: string
  slim: boolean
  png: Buffer
}

/** Gültige Java-Namen: 3–16 Zeichen, Buchstaben, Ziffern, Unterstrich. */
export function gueltigerName(name: string): boolean {
  return /^[A-Za-z0-9_]{3,16}$/.test(name)
}

/** Liest Skin-Adresse und Armform aus dem base64-kodierten „textures“-Eintrag des Profils. */
export function texturAusProfil(profil: { properties?: { name: string; value: string }[] }): { url: string; slim: boolean } | null {
  const eintrag = profil.properties?.find((p) => p.name === 'textures')
  if (!eintrag) return null
  const daten = JSON.parse(Buffer.from(eintrag.value, 'base64').toString('utf8')) as { textures?: { SKIN?: { url?: string; metadata?: { model?: string } } } }
  const skin = daten.textures?.SKIN
  if (!skin?.url) return null
  return { url: skin.url.replace(/^http:/, 'https:'), slim: skin.metadata?.model === 'slim' }
}

export async function skinAusName(name: string, holen: typeof fetch = fetch): Promise<SkinAusName> {
  const n = name.trim()
  if (!gueltigerName(n)) throw new Error(t('skin.nameUngueltig'))
  const r = await holen(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(n)}`)
  if (r.status === 404 || r.status === 204) throw new Error(t('skin.gibtsNicht', { name: n }))
  if (!r.ok) throw new Error(t('skin.mojangAus', { status: r.status }))
  const konto = (await r.json()) as { id: string; name: string }
  const p = await holen(`https://sessionserver.mojang.com/session/minecraft/profile/${konto.id}`)
  if (!p.ok) throw new Error(t('skin.profilFehlt', { name: konto.name, status: p.status }))
  const textur = texturAusProfil((await p.json()) as { properties?: { name: string; value: string }[] })
  if (!textur) throw new Error(t('skin.keinSkin', { name: konto.name }))
  const bild = await holen(textur.url)
  if (!bild.ok) throw new Error(t('skin.ladenFehlt', { name: konto.name, status: bild.status }))
  return { name: konto.name, uuid: konto.id, slim: textur.slim, png: Buffer.from(await bild.arrayBuffer()) }
}
