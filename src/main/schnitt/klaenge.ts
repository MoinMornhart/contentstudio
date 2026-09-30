// Herkunft: MoinStudio src/main/schnitt/klaenge.ts (MIT).
import { execFile } from 'node:child_process'
import { mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Geräusche für Effekte (ROADMAP 5.4): lizenzfrei aus FFmpeg-Klangerzeugern gebaut, einmal je Gerät unter
 * %LOCALAPPDATA%\ContentStudio\klaenge. Kein fremdes Material, nichts im Repo.
 */
export const KLAENGE: Record<string, { beschreibung: string; quelle: string; filter?: string }> = {
  whoosh: { beschreibung: 'Wusch (Schnitt, schnelle Bewegung, Übergang)', quelle: 'anoisesrc=d=0.7:c=pink:a=0.9', filter: 'bandpass=f=900:w=1200,afade=t=in:d=0.3:curve=exp,afade=t=out:st=0.35:d=0.35' },
  boom: { beschreibung: 'Explosion, tiefer Knall', quelle: "aevalsrc='0.9*sin(2*PI*(48-30*t)*t)*exp(-3*t)+0.5*(random(0)*2-1)*exp(-6*t)':d=1.6", filter: 'lowpass=f=900' },
  ding: { beschreibung: 'Glöckchen (Fund, Erfolg, Idee)', quelle: "aevalsrc='0.6*(sin(2*PI*1320*t)+0.5*sin(2*PI*2640*t)+0.25*sin(2*PI*3960*t))*exp(-4*t)':d=1.2" },
  piep: { beschreibung: 'Zensur-Piep', quelle: "aevalsrc='0.5*sin(2*PI*1000*t)':d=0.5" },
  plopp: { beschreibung: 'Plopp (Einblendung, Pop-up)', quelle: "aevalsrc='0.8*sin(2*PI*(300+900*t)*t)*exp(-22*t)':d=0.3" },
  aufstieg: { beschreibung: 'Spannung steigt (vor einem Höhepunkt)', quelle: "aevalsrc='0.4*sin(2*PI*(150*t+220*t*t))*(t/1.6)+0.15*(random(0)*2-1)*(t/1.6)':d=1.6", filter: 'lowpass=f=3000' },
  fail: { beschreibung: 'Wah-wah-waaah (Fail, Pech)', quelle: "aevalsrc='0.5*sin(2*PI*(if(lt(t,0.35),392,if(lt(t,0.7),370,if(lt(t,1.05),349,330+8*sin(2*PI*6*t)))))*t)*if(lt(t,1.05),1,exp(-2*(t-1.05)))':d=2.2" },
  herzschlag: { beschreibung: 'Herzschlag (Anspannung)', quelle: "aevalsrc='0.9*sin(2*PI*55*t)*(exp(-30*mod(t,0.9))+0.7*exp(-30*abs(mod(t,0.9)-0.22)))':d=1.8", filter: 'lowpass=f=400' },
  kasse: { beschreibung: 'Kaching (Gewinn, Diamanten)', quelle: "aevalsrc='0.5*(sin(2*PI*1568*t)*exp(-8*t)+sin(2*PI*2093*max(0,t-0.08))*exp(-6*max(0,t-0.08))*gt(t,0.08))':d=1.0" },
  trommel: { beschreibung: 'Trommelwirbel (Enthüllung)', quelle: "aevalsrc='0.6*(random(0)*2-1)*(0.6+0.4*sin(2*PI*28*t))*min(1,t*2)':d=2.0", filter: 'bandpass=f=250:w=400' }
}

const lauf = (exe: string, args: string[]): Promise<void> =>
  new Promise((resolve, reject) => execFile(exe, args, { windowsHide: true, timeout: 60_000 }, (err) => (err ? reject(err) : resolve())))

/** Legt fehlende Geräusche an und gibt Name → Datei zurück. */
export async function sichereKlaenge(ffmpeg: string, ordner: string): Promise<Record<string, string>> {
  await mkdir(ordner, { recursive: true })
  const dateien: Record<string, string> = {}
  for (const [name, k] of Object.entries(KLAENGE)) {
    const ziel = join(ordner, `${name}.wav`)
    if (!(await stat(ziel).catch(() => null))) {
      // Abtastrate heißt bei anoisesrc „r“, bei aevalsrc „s“
      const quelle = `${k.quelle}:${k.quelle.startsWith('anoisesrc') ? 'r' : 's'}=48000`
      await lauf(ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', quelle, ...(k.filter ? ['-af', k.filter] : []), '-ac', '2', '-ar', '48000', ziel])
    }
    dateien[name] = ziel
  }
  return dateien
}
