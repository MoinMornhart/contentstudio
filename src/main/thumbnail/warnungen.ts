import type { Sprache } from '@shared/i18n'

/**
 * Die Render-Skripte (Blender, Bild-Umgebung) melden ihre Befunde auf Deutsch; die Muster hier bringen sie in die
 * Sprache der Oberfläche. Unbekannte Meldungen bleiben, wie sie sind.
 */
const EN: [RegExp, string][] = [
  [/^Kopf angeschnitten$/, 'Head cut off'],
  [/^Logo überdeckt etwas Wichtiges$/, 'Logo covers something important'],
  [/^Modell ohne Skelett – keine Pose möglich$/, 'Model without a skeleton – no pose possible'],
  [/^Kein bekanntes Skelett gefunden – Figur bleibt in ihrer Grundhaltung$/, 'No known skeleton found – figure keeps its rest pose'],
  [/^Skelett nur teilweise erkannt – Pose vereinfacht$/, 'Skeleton only partly recognised – pose simplified'],
  [/^Etwas versperrt die Sicht \((\d+) % des Bildes liegen vor der Hauptfigur\)$/, 'Something blocks the view ($1 % of the image is in front of the main figure)'],
  [/^Gegner (.+) zu klein im Bild$/, 'Opponent $1 too small in the image'],
  [/^Gesicht von (.+) verdeckt oder abgewandt \((\d+) % sichtbar\)$/, 'Face of $1 covered or turned away ($2 % visible)'],
  [/^Gesicht von (.+) nicht erkannt – Kopf geschätzt$/, 'Face of $1 not detected – head estimated'],
  [/^Gesicht von (.+) angeschnitten$/, 'Face of $1 cut off'],
  [/^Foto von (.+) ist an beiden Seiten abgeschnitten – Kante sichtbar$/, 'Photo of $1 is cut on both sides – edge visible'],
  [/^Bild einer Figur \((.+)\) ist nach dem Freistellen leer$/, 'Image of figure $1 is empty after cutting out'],
  [/^Item von (.+) kaum sichtbar \((\d+) % im Bild\)$/, 'Item of $1 barely visible ($2 % in the image)'],
  [/^Kamera trifft das Stilbuch nicht \(Abweichung ([\d.]+)\).*$/, 'Camera misses the style guide (deviation $1) – move the subject closer to the figure'],
  [/^Kopf von (.+) am Bildrand angeschnitten$/, 'Head of $1 cut off at the edge'],
  [/^Kopf von (.+) kaum sichtbar$/, 'Head of $1 barely visible'],
  [/^Mob (.+) verdeckt \((\d+) % sichtbar\).*$/, 'Mob $1 covered ($2 % visible) – place it in front of or next to the main figure'],
  [/^Mob (.+) am Bildrand angeschnitten.*$/, 'Mob $1 cut off at the edge – move it towards the centre'],
  [/^Mob (.+) kaum sichtbar$/, 'Mob $1 barely visible'],
  [/^Mob (.+) zu klein im Bild \((\d+) % der Bildhöhe\).*$/, 'Mob $1 too small ($2 % of the image height) – move it closer'],
  [/^Objekt (.+) \((objekt:\d+)\) nicht ganz im Bild \((\d+) %\).*$/, 'Object $1 ($2) not fully in the image ($3 %)'],
  [/^Text „(.*)“ findet keinen freien Platz und überdeckt Wichtiges$/, 'Text “$1” finds no free space and covers something important'],
  [/^Gegenstand (\d+) verdeckt das Gesicht von (.+)$/, 'Object $1 covers the face of $2'],
  [/^Kopf von (.+) zu klein im Bild \((\d+) % der Bildhöhe\).*$/, 'Head of $1 too small ($2 % of the image height) – move the camera closer, main figure big like the examples'],
  [/^Kopf von (.+) klebt am Bildrand \((\d+) % von links\).*$/, 'Head of $1 sticks to the edge ($2 % from the left) – main figure to the left or right third'],
  [/^Text „(.*)“ ist auf dem Handy klein.*$/, 'Text “$1” is small on a phone – shorten it or leave more room'],
  [/^Gegenstand (\d+) nicht lesbar – weggelassen$/, 'Object $1 unreadable – left out'],
  [/^Gegenstand „(.+)“ nicht gefunden – weggelassen$/, 'Object “$1” not found – left out'],
  [/^Kein Ortsfoto zu „(.+)“ – Farbverlauf stattdessen$/, 'No location photo for “$1” – gradient instead'],
  [/^Ortsfoto nicht geladen \((.+)\) – Farbverlauf stattdessen$/, 'Location photo not loaded ($1) – gradient instead']
]

export function uebersetzeWarnung(w: string, sprache: Sprache): string {
  if (sprache === 'de') return w
  for (const [re, ziel] of EN) if (re.test(w)) return w.replace(re, ziel)
  return w
}
