import { effektText } from '@shared/effekt-text'
import { t } from '../i18n'
import type { Effekt } from '../schnitt/effekte'
import { sauber } from '../schnitt/render'
import { zeitbasis, zoomKeyframes, type PremiereOptionen, type PremiereZoom } from './premiere'
import { stuecke } from './resolve'

/**
 * After Effects (ROADMAP 7.1, ungetestet in After Effects): After Effects liest kein FCP7-XML, aber Skripte. ContentStudio
 * schreibt ein ExtendScript (Datei → Skripts → Skriptdatei ausführen), das das Original importiert, eine Komposition
 * anlegt, jedes behaltene Stück als Ebene an seine Stelle setzt, Zooms als Skalierungs-Keyframes und Texte als
 * Textebenen einfügt und Kapitel sowie Effekte als Kompositionsmarken setzt. Mit `ergebnis` schreibt das Skript am Ende
 * eine JSON-Datei mit dem, was es angelegt hat (für den Selbsttest).
 */

const js = (s: string): string => JSON.stringify(s)
const zahl = (n: number): string => String(Math.round(n * 10000) / 10000)
const effektStart = (e: Effekt): number => ('von' in e ? e.von : 'bei' in e ? e.bei : 0)

export function afterEffectsSkript(o: PremiereOptionen & { ergebnis?: string }): string {
  const fps = zeitbasis(o.quelle.fps).echt
  const teile = stuecke(o.liste.behalten, o.quelle.fps)
  const laenge = teile.length ? (teile[teile.length - 1]!.start + teile[teile.length - 1]!.outF - teile[teile.length - 1]!.inF) / fps : 1
  const effekte = o.effekte ?? []
  const zooms: PremiereZoom[] = [...o.zooms, ...effekte.flatMap((e) => (e.art === 'zoom' ? [{ start: e.von, ende: e.bis, faktor: e.faktor, x: e.x, y: e.y }] : []))]
  // Stücke: [Start in der Komposition, In und Out im Original, Skalierungs-Keyframes [Zeit in der Komposition, Prozent]]
  const liste = teile.map((s) => {
    const kf = zoomKeyframes(zooms, s.a, s.b).map((k) => `[${zahl(s.start / fps + (k.t - s.a))},${zahl(k.wert)}]`)
    return `[${zahl(s.start / fps)},${zahl(s.inF / fps)},${zahl(s.outF / fps)},[${kf.join(',')}]]`
  })
  const texte = effekte.flatMap((e) => (e.art === 'text' ? [`[${js(sauber(e.text))},${zahl(e.von)},${zahl(e.bis)},${js(e.lage ?? 'oben')}]`] : []))
  const marken = [
    ...o.kapitel.map((k) => `[${zahl(k.zeit)},${js(sauber(k.titel))}]`),
    ...effekte.map((e) => `[${zahl(effektStart(e))},${js(sauber(t('programme.marker.effekt', { text: effektText(e, t) })))}]`)
  ]
  return `// ${t('programme.ae.kopf')}
// ${t('programme.ae.anleitung')}
(function () {
  var QUELLE = ${js(o.quelle.pfad.replace(/\\/g, '/'))};
  var NAME = ${js(sauber(o.name))};
  var NAME_JSON = ${js(JSON.stringify(sauber(o.name)))};
  var BREITE = ${o.quelle.breite}, HOEHE = ${o.quelle.hoehe}, FPS = ${zahl(fps)}, LAENGE = ${zahl(Math.max(laenge, 1 / fps))};
  var STUECKE = [${liste.join(',')}];
  var TEXTE = [${texte.join(',')}];
  var MARKEN = [${marken.join(',')}];
  var ERGEBNIS = ${o.ergebnis ? js(o.ergebnis.replace(/\\/g, '/')) : 'null'};
  var datei = new File(QUELLE);
  if (!datei.exists) { alert(${js(t('programme.ae.fehlt'))} + "\\n" + QUELLE); return; }
  app.beginUndoGroup("ContentStudio");
  var quelle = app.project.importFile(new ImportOptions(datei));
  var comp = app.project.items.addComp(NAME, BREITE, HOEHE, 1, LAENGE, FPS);
  for (var i = 0; i < STUECKE.length; i++) {
    var s = STUECKE[i];
    var ebene = comp.layers.add(quelle);
    ebene.startTime = s[0] - s[1];
    ebene.inPoint = s[0];
    ebene.outPoint = s[0] + (s[2] - s[1]);
    ebene.name = NAME + " " + (i + 1);
    var skala = ebene.property("ADBE Transform Group").property("ADBE Scale");
    for (var k = 0; k < s[3].length; k++) skala.setValueAtTime(s[3][k][0], [s[3][k][1], s[3][k][1]]);
  }
  for (var j = 0; j < TEXTE.length; j++) {
    var tx = TEXTE[j];
    var te = comp.layers.addText(tx[0]);
    te.inPoint = tx[1];
    te.outPoint = tx[2];
    var y = tx[3] === "unten" ? HOEHE * 0.82 : tx[3] === "mitte" ? HOEHE * 0.5 : HOEHE * 0.18;
    te.property("ADBE Transform Group").property("ADBE Position").setValue([BREITE / 2, y]);
  }
  for (var m = 0; m < MARKEN.length; m++) comp.markerProperty.setValueAtTime(MARKEN[m][0], new MarkerValue(MARKEN[m][1]));
  comp.openInViewer();
  app.endUndoGroup();
  if (ERGEBNIS) {
    var aus = new File(ERGEBNIS);
    aus.encoding = "UTF-8";
    aus.open("w");
    // ExtendScript kennt je nach Version kein JSON: der Name steht schon fertig als JSON-Text im Skript
    aus.write('{"komposition":' + NAME_JSON + ',"passt":' + (comp.name === NAME) + ',"breite":' + comp.width + ',"hoehe":' + comp.height + ',"dauer":' + comp.duration + ',"ebenen":' + comp.numLayers + ',"marken":' + comp.markerProperty.numKeys + '}');
    aus.close();
  }
})();
`
}
