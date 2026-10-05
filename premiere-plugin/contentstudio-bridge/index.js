// ContentStudio Bridge (aus MoinStudio v0.47.0, ungetestet): verbindet Premiere Pro mit ContentStudio (WebSocket-Client auf 127.0.0.1:47812) und führt
// dessen Befehle mit der Premiere-UXP-API aus. Protokoll siehe src/main/premiere/bruecke.ts.
const ppro = require('premierepro')
const fs = require('fs')

const VERSION = '0.1.0'
const ADRESSE = 'ws://127.0.0.1:47812'
let ws = null

const statusEl = () => document.getElementById('status')
function log(text) {
  const el = document.getElementById('log')
  if (el) el.textContent = (new Date().toLocaleTimeString() + ' ' + text + '\n' + el.textContent).slice(0, 4000)
}
function status(text) {
  const el = statusEl()
  if (el) el.textContent = text
}
function senden(obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj))
}

async function projekt() {
  const p = await ppro.Project.getActiveProject()
  if (!p) throw new Error('Kein Projekt offen')
  return p
}

async function sequenzNach(name) {
  const p = await projekt()
  if (!name) return p.getActiveSequence()
  const alle = await p.getSequences()
  const s = alle.find((x) => x.name === name)
  if (!s) throw new Error('Sequenz nicht gefunden: ' + name)
  return s
}

const befehle = {
  async ping() {
    return { version: VERSION }
  },
  // Neues Projekt anlegen (oder vorhandenes öffnen)
  async projektNeu({ pfad }) {
    let vorhanden = false
    try {
      fs.lstatSync(pfad)
      vorhanden = true
    } catch (e) {
      vorhanden = false
    }
    const p = vorhanden ? await ppro.Project.open(pfad, {}) : await ppro.Project.createProject(pfad)
    return { name: p && p.name, neu: !vorhanden }
  },
  async importieren({ dateien }) {
    const p = await projekt()
    const wurzel = await p.getRootItem()
    const ok = await p.importFiles(dateien, true, wurzel, false)
    return { ok }
  },
  async sequenzen() {
    const p = await projekt()
    const alle = await p.getSequences()
    return alle.map((s) => s.name)
  },
  async sequenzAktivieren({ name }) {
    const p = await projekt()
    const s = await sequenzNach(name)
    await p.setActiveSequence(s)
    return { name: s.name }
  },
  async speichern() {
    const p = await projekt()
    return { ok: await p.save() }
  },
  // Export der Sequenz: art "sofort" (Premiere rendert selbst) oder "ame" (Media Encoder im Hintergrund)
  async exportieren({ sequenz, ziel, preset, art }) {
    const s = await sequenzNach(sequenz)
    const em = ppro.EncoderManager.getManager()
    const typ = art === 'ame' ? ppro.Constants.ExportType.QUEUE_TO_AME : ppro.Constants.ExportType.IMMEDIATELY
    const E = ppro.EncoderManager
    return await new Promise((resolve, reject) => {
      const weg = []
      const hoere = (name, fn) => {
        if (!name) return
        ppro.EventManager.addEventListener(em, name, fn, false)
        weg.push(() => ppro.EventManager.removeEventListener(em, name, fn))
      }
      const fertig = (fehler) => {
        weg.forEach((f) => {
          try {
            f()
          } catch (e) {
            /* egal */
          }
        })
        if (fehler) reject(new Error(fehler))
        else resolve({ ziel })
      }
      hoere(E.EVENT_RENDER_PROGRESS, (ev) => senden({ ereignis: 'render', daten: { prozent: ev && (ev.progress ?? ev.percent ?? ev.value) } }))
      hoere(E.EVENT_RENDER_COMPLETE, () => fertig(null))
      hoere(E.EVENT_RENDER_ERROR, (ev) => fertig('Render-Fehler in Premiere: ' + JSON.stringify(ev || {})))
      hoere(E.EVENT_RENDER_CANCEL, () => fertig('Render abgebrochen'))
      em.exportSequence(s, typ, ziel, preset, true)
        .then(async (ok) => {
          if (!ok) return fertig('Premiere hat den Export abgelehnt')
          if (art === 'ame') await em.startBatchEncode()
        })
        .catch((e) => fertig(String(e && e.message ? e.message : e)))
    })
  }
}

// Nur Befehle mit dem Schlüssel, den ContentStudio beim Start in %LOCALAPPDATA%\ContentStudio\premiere\schluessel ablegt –
// ein fremdes Programm auf Port 47812 kann Premiere so nicht steuern. Es gibt bewusst keinen Befehl für beliebigen Code.
function erwarteterSchluessel() {
  try {
    const lokal = require('os').homedir() + '\\AppData\\Local\\ContentStudio\\premiere\\schluessel'
    return String(fs.readFileSync(lokal, { encoding: 'utf-8' })).trim()
  } catch (e) {
    return null
  }
}

async function bearbeite(text) {
  let m
  try {
    m = JSON.parse(text)
  } catch (e) {
    return
  }
  const schluessel = erwarteterSchluessel()
  if (!schluessel || m.schluessel !== schluessel) return senden({ id: m.id, ok: false, fehler: 'Schlüssel passt nicht – Befehl abgelehnt' })
  const f = Object.prototype.hasOwnProperty.call(befehle, m.befehl) ? befehle[m.befehl] : null
  if (!f) return senden({ id: m.id, ok: false, fehler: 'Unbekannter Befehl: ' + m.befehl })
  log('→ ' + m.befehl)
  try {
    const ergebnis = await f(m.args || {})
    senden({ id: m.id, ok: true, ergebnis })
  } catch (e) {
    log('Fehler: ' + (e && e.message ? e.message : e))
    senden({ id: m.id, ok: false, fehler: String(e && e.message ? e.message : e) })
  }
}

// Verbinden mit Wiederholung (ContentStudio kann später starten; Premiere 26.2: Netzwerkrecht kommt manchmal verspätet)
function verbinden() {
  try {
    ws = new WebSocket(ADRESSE)
  } catch (e) {
    status('wartet auf ContentStudio …')
    return setTimeout(verbinden, 3000)
  }
  ws.onopen = () => {
    status('verbunden')
    let premiere = ''
    try {
      premiere = require('uxp').host.version
    } catch (e) {
      premiere = '?'
    }
    senden({ hallo: { version: VERSION, premiere } })
  }
  ws.onmessage = (ev) => bearbeite(ev.data)
  ws.onclose = () => {
    status('wartet auf ContentStudio …')
    ws = null
    setTimeout(verbinden, 3000)
  }
  ws.onerror = () => {
    /* onclose folgt */
  }
}

verbinden()
