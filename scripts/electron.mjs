// Startet Electron mit den übergebenen Argumenten, aber ohne ELECTRON_RUN_AS_NODE.
// Manche Werkzeuge (z. B. Editor-Erweiterungen) setzen diese Variable global; dann würde
// Electron als reines Node laufen und die App nicht starten.
import { spawn } from 'node:child_process'
import electronPath from 'electron'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electronPath, process.argv.slice(2), { stdio: 'inherit', env })
child.on('exit', (code) => process.exit(code ?? 1))
