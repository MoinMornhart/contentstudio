// Herkunft: ContentStudio src/shared/app.ts (MIT), verallgemeinert für ContentStudio.
import type { HardwareState } from './hardware'
import type { QueueState } from './jobs'
import type { Schluessel, Sprache } from './i18n'
import type { Konto, Plattform, Profil, Programm } from './profil'
import type { KiWegStand, McpZiel } from './ki'
import type { ExportFormat, Stilbuch, ThumbAuftragInfo, ThumbStart, VarianteInfo, VideoErgebnis, Vorbild } from './thumbnail'
import type { ProgrammeStand, ProgrammId, SchnittZiel } from './programme'
import type { PlanungAenderung, PlanungKarte, PlanungKiArt, PlanungKiStand, PlanungThumbStand, Spalte } from './planung'
import type { SchnittAbschnitt, SchnittEffekt, SchnittExport, SchnittHighlight, SchnittListe, SchnittProjekt, SpurArt } from './schnitt'

/** Reiter der Hauptoberfläche. Reihenfolge = Reihenfolge in der Navigation. */
export const TABS = [
  { id: 'thumbnail', label: 'tab.thumbnail', icon: '🎨' },
  { id: 'schnitt', label: 'tab.schnitt', icon: '✂️' },
  { id: 'planung', label: 'tab.planung', icon: '🗂️' },
  { id: 'einstellungen', label: 'tab.einstellungen', icon: '⚙️' }
] as const satisfies readonly { id: string; label: Schluessel; icon: string }[]

export type TabId = (typeof TABS)[number]['id']

export function isTabId(value: unknown): value is TabId {
  return typeof value === 'string' && TABS.some((t) => t.id === value)
}

/** IPC-Kanalnamen zwischen Main und Renderer an einer Stelle. */
export const IPC = {
  appInfo: 'app:info',
  selectTab: 'ui:select-tab',
  autostartGet: 'autostart:get',
  autostartSet: 'autostart:set',
  updateCheck: 'update:check',
  updateDownload: 'update:download',
  updateInstall: 'update:install',
  updateStatus: 'update:status',
  openLogs: 'app:open-logs',
  spracheGet: 'sprache:get',
  spracheSet: 'sprache:set',
  dataStatus: 'data:status',
  dataChoose: 'data:choose',
  dataOpen: 'data:open',
  toolsStatus: 'tools:status',
  toolsInstall: 'tools:install',
  toolsProgress: 'tools:progress',
  /** invoke: aktuellen Zustand holen · event: Zustandsänderung */
  hwState: 'hw:state',
  hwRun: 'hw:run',
  hwProbe: 'hw:probe',
  jobsState: 'jobs:state',
  jobsAction: 'jobs:action',
  jobsImage: 'jobs:image',
  setupState: 'setup:state',
  setupComplete: 'setup:complete',
  setupStep: 'ui:setup-step',
  profilLaden: 'profil:laden',
  profilSpeichern: 'profil:speichern',
  profilDateien: 'profil:dateien',
  profilSkinName: 'profil:skin-name',
  profilBild: 'profil:bild',
  profilMetadaten: 'profil:metadaten',
  /** Ereignis: Profil wurde geändert (auch vom anderen Gerät oder aus den Einstellungen) */
  profilGeaendert: 'profil:geaendert',
  programmeFinden: 'programme:finden',
  kiWege: 'ki:wege',
  kiSchluessel: 'ki:schluessel',
  kiMonat: 'ki:monat',
  kiTest: 'ki:test',
  mcpZiele: 'mcp:ziele',
  mcpVerbinden: 'mcp:verbinden',
  mcpEintrag: 'mcp:eintrag',
  werkzeugeNoetig: 'tools:noetig',
  thumbStart: 'thumb:start',
  thumbDatei: 'thumb:datei',
  thumbAuftraege: 'thumb:auftraege',
  thumbErgebnis: 'thumb:ergebnis',
  thumbAendern: 'thumb:aendern',
  thumbLoeschen: 'thumb:loeschen',
  thumbExport: 'thumb:export',
  thumbKiStand: 'thumb:ki-stand',
  thumbVideo: 'thumb:video',
  thumbVideoErgebnis: 'thumb:video-ergebnis',
  vorbildListe: 'vorbild:liste',
  vorbildHinzu: 'vorbild:hinzu',
  vorbildAendern: 'vorbild:aendern',
  vorbildLoeschen: 'vorbild:loeschen',
  stilbuch: 'stilbuch:laden',
  stilbuchErstellen: 'stilbuch:erstellen',
  schnittProjekte: 'schnitt:projekte',
  schnittImport: 'schnitt:import',
  schnittWellenform: 'schnitt:wellenform',
  schnittLoeschen: 'schnitt:loeschen',
  schnittTranskript: 'schnitt:transkript',
  schnittTranskriptStart: 'schnitt:transkript-start',
  schnittRohschnittStart: 'schnitt:rohschnitt-start',
  schnittListe: 'schnitt:liste',
  schnittUmschalten: 'schnitt:umschalten',
  schnittBereich: 'schnitt:bereich',
  schnittWunsch: 'schnitt:wunsch',
  schnittEinstellungen: 'schnitt:einstellungen',
  schnittBib: 'schnitt:bib',
  schnittBibSpeichern: 'schnitt:bib-speichern',
  schnittBibLoeschen: 'schnitt:bib-loeschen',
  schnittBibDatei: 'schnitt:bib-datei',
  schnittBibVorschau: 'schnitt:bib-vorschau',
  schnittBibPipette: 'schnitt:bib-pipette',
  schnittVorschau: 'schnitt:vorschau',
  schnittExport: 'schnitt:export',
  schnittExportInfo: 'schnitt:export-info',
  schnittExportSpeichern: 'schnitt:export-speichern',
  schnittThumbnail: 'schnitt:thumbnail',
  schnittHighlightsStart: 'schnitt:highlights-start',
  schnittHighlights: 'schnitt:highlights',
  schnittClips: 'schnitt:clips',
  schnittClipDateien: 'schnitt:clip-dateien',
  schnittClipOrdner: 'schnitt:clip-ordner',
  schnittEffekte: 'schnitt:effekte',
  schnittEffektAendern: 'schnitt:effekt-aendern',
  schnittSpurHinzu: 'schnitt:spur-hinzu',
  schnittSpurAendern: 'schnitt:spur-aendern',
  planungKarten: 'planung:karten',
  planungNeu: 'planung:neu',
  planungAendern: 'planung:aendern',
  planungVerschieben: 'planung:verschieben',
  planungLoeschen: 'planung:loeschen',
  planungGeaendert: 'planung:geaendert',
  planungSchneiden: 'planung:schneiden',
  planungThumbnail: 'planung:thumbnail',
  planungThumbVarianten: 'planung:thumb-varianten',
  planungThumbWaehlen: 'planung:thumb-waehlen',
  planungKi: 'planung:ki',
  planungKiStand: 'planung:ki-stand',
  planungCrossPlan: 'planung:cross-plan',
  planungPaket: 'planung:paket',
  uploadVerbindungen: 'upload:verbindungen',
  uploadVerbinden: 'upload:verbinden',
  uploadTrennen: 'upload:trennen',
  uploadStart: 'upload:start',
  programmeStatus: 'programme:status',
  programmSelbsttest: 'programme:selbsttest',
  schnittProgramm: 'schnitt:programm',
  hwLeistung: 'hw:leistung',
  hwLeistungStand: 'hw:leistung-stand'
} as const

/** Wofür eine Datei hochgeladen wird: bestimmt Dateityp-Filter, Mehrfachauswahl und Zielordner im Datenordner. */
export type ProfilDateiZweck = 'foto' | 'skin' | 'bilder' | 'modell' | 'maskottchen' | 'logo' | 'schrift' | 'vorbild'

export interface ProfilStand {
  profil: Profil
  /** Fehler beim Lesen einer vorhandenen Datei (Profil bleibt dann leer, die Datei unangetastet) */
  fehler: string | null
}

/** Gefundenes Programm (Premiere, Resolve, OBS …) */
export interface ProgrammFundInfo {
  id: Programm
  pfad: string
  version: string | null
}

export type JobAction = 'pause' | 'resume' | 'cancel' | 'pauseAll' | 'resumeAll'

export type ToolId = 'blender' | 'ffmpeg' | 'uv'

export interface ToolStatus {
  id: ToolId
  label: string
  version: string
  installed: boolean
  path: string | null
  sizeBytes: number
}

export interface ToolProgressEvent {
  id: ToolId
  version: string
  phase: 'check' | 'download' | 'verify' | 'extract' | 'done' | 'error'
  percent: number | null
  message?: string
}

export interface DataDirStatus {
  /** Gewählter Datenordner oder null, wenn noch keiner eingerichtet ist */
  dataDir: string | null
  /** false, wenn der Ordner fehlt (z. B. Sync-Dienst noch nicht fertig oder Laufwerk getrennt) */
  available: boolean
  /** Konfliktkopien von OneDrive, iCloud, Dropbox oder Google Drive (relativ zum Datenordner) */
  conflicts: { original: string; copy: string }[]
}

/** Zustand der Update-Funktion (GitHub-Releases über electron-updater). */
export type UpdateStatus =
  | { state: 'dev' }
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'none'; version: string }
  | { state: 'available'; version: string; notes: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

export interface AutostartState {
  /** false in der Entwicklungsumgebung: dort würde sonst electron.exe eingetragen. */
  available: boolean
  enabled: boolean
}

export interface AppInfo {
  name: string
  version: string
  platform: string
  arch: string
  electron: string
  chrome: string
  node: string
}

/** Sprache der Oberfläche: gewählt (null = wie Windows) und wirksam */
export interface SpracheStand {
  gewaehlt: Sprache | null
  wirksam: Sprache
  system: Sprache
}

/** Die über die Preload-Brücke erreichbare API (`window.cs`). */
export interface BibChroma {
  farbe: string
  toleranz: number
  weichheit: number
  spill: number
}
export const BIB_LAGEN = ['oben-links', 'oben', 'oben-rechts', 'links', 'mitte', 'rechts', 'unten-links', 'unten', 'unten-rechts', 'voll'] as const
export type BibLage = (typeof BIB_LAGEN)[number]
/** Effekt aus der Bibliothek (Spiegel von src/main/schnitt/bibliothek.ts) */
export interface BibEffektDaten {
  id: string
  name: string
  video?: { datei: string; greenscreen: boolean; ton: boolean }
  bild?: { datei: string; dauer: number }
  sound?: { datei: string; lautstaerke: number }
  chroma?: BibChroma
  haeufigkeit: { modus: 'immer' | 'manchmal' | 'manuell'; jedes?: number; prozent?: number }
  konten: string[]
  richtungen: string[]
  platzierung: { modus: 'fest' | 'ki'; bezug?: 'start' | 'ende'; sekunden?: number }
  lage: BibLage
  groesse: number
  erstellt: string
  zaehler?: number
}
export interface BibDateiErgebnis {
  id: string
  datei: string
  dauer: number
  chroma: BibChroma | null
  /** Key-Farbe wurde automatisch erkannt (sonst Standard-Grün) */
  erkannt: boolean
}

export interface CsApi {
  appInfo(): Promise<AppInfo>
  onSelectTab(handler: (tab: TabId) => void): () => void
  getAutostart(): Promise<AutostartState>
  setAutostart(enabled: boolean): Promise<AutostartState>
  checkForUpdate(): Promise<UpdateStatus>
  downloadUpdate(): Promise<void>
  installUpdate(): Promise<void>
  onUpdateStatus(handler: (status: UpdateStatus) => void): () => void
  openLogs(): Promise<void>
  sprache(): Promise<SpracheStand>
  /** null = wieder wie Windows */
  setzeSprache(sprache: Sprache | null): Promise<SpracheStand>
  dataStatus(): Promise<DataDirStatus>
  /** Öffnet den Ordner-Dialog; null, wenn abgebrochen */
  chooseDataDir(): Promise<DataDirStatus | null>
  openDataDir(): Promise<void>
  toolsStatus(): Promise<ToolStatus[]>
  installTool(id: ToolId): Promise<ToolStatus[]>
  onToolProgress(handler: (p: ToolProgressEvent) => void): () => void
  hardwareState(): Promise<HardwareState>
  runHardwareTest(): Promise<HardwareState>
  onHardwareState(handler: (s: HardwareState) => void): () => void
  /** Startet die Aufgabe „Probebild“ mit der Vorschau-Einstellung; liefert die Aufgaben-ID */
  probeRender(): Promise<string>
  jobsState(): Promise<QueueState>
  jobAction(action: JobAction, id?: string): Promise<QueueState>
  onJobsState(handler: (s: QueueState) => void): () => void
  /** Ergebnisbild einer Aufgabe als Data-URL (oder null) */
  jobImage(id: string): Promise<string | null>
  /** true = Einrichtungsassistent wurde abgeschlossen */
  setupState(): Promise<boolean>
  setupComplete(done: boolean): Promise<boolean>
  onSetupStep(handler: (step: number) => void): () => void
  /** Creator-Profil (ROADMAP M2) */
  profilLaden(): Promise<ProfilStand>
  profilSpeichern(profil: Profil): Promise<Profil>
  /** Dateidialog: kopiert gewählte Dateien in den Datenordner und liefert relative Pfade (leer bei Abbruch) */
  profilDateien(zweck: ProfilDateiZweck, kontoId?: string): Promise<string[]>
  /** Minecraft-Skin per Accountname laden und ablegen */
  profilSkinName(name: string): Promise<{ datei: string; slim: boolean; name: string }>
  /** Bild aus dem Datenordner als Data-URL */
  profilBild(datei: string): Promise<string | null>
  /** Öffentliche Metadaten eines Kontos abrufen (nur mit gespeicherter Zustimmung); liefert das aktualisierte Konto */
  profilMetadaten(kontoId: string): Promise<Konto>
  onProfilGeaendert(handler: (profil: Profil) => void): () => void
  programmeFinden(): Promise<ProgrammFundInfo[]>
  /** Welche Werkzeuge braucht dieses Profil? */
  werkzeugeNoetig(): Promise<ToolId[]>
  /** KI-Wege (ROADMAP M3): Zustand aller Wege; Schlüssel setzen (null = löschen); Monatssumme; Test-Aufruf */
  kiWege(): Promise<KiWegStand[]>
  kiSchluessel(id: string, schluessel: string | null): Promise<KiWegStand>
  kiMonat(): Promise<number>
  kiTest(id: string): Promise<{ modell: string | null; kostenUsd: number | null }>
  /** MCP (ROADMAP 3.7): Desktop-Apps, die ContentStudio als Werkzeug nutzen können */
  mcpZiele(): Promise<McpZiel[]>
  mcpVerbinden(id: McpZiel['id']): Promise<McpZiel[]>
  /** Eintrag zum Selbst-Eintragen (Befehl, Argumente, Umgebung) */
  mcpEintrag(): Promise<{ command: string; args: string[]; env: Record<string, string> }>
  /** Thumbnail (ROADMAP M4): Auftrag starten, Dateien wählen, Aufträge, Ergebnisse, Änderung, Export */
  thumbStart(start: Partial<ThumbStart> & { kontoId: string }): Promise<string>
  /** Dateidialog; liefert den absoluten Pfad oder null */
  thumbDatei(zweck: 'bild' | 'video'): Promise<string | null>
  thumbAuftraege(): Promise<ThumbAuftragInfo[]>
  thumbErgebnis(jobId: string): Promise<VarianteInfo[] | null>
  thumbAendern(jobId: string, index: number, wunsch: string): Promise<string>
  thumbLoeschen(jobId: string): Promise<void>
  thumbExport(jobId: string, index: number, format: ExportFormat, typ: 'png' | 'jpg' | 'psd'): Promise<string | null>
  thumbKiStand(): Promise<{ ki: boolean; bildKi: boolean }>
  thumbVideo(video: string, kontoId: string, titel?: string): Promise<string>
  thumbVideoErgebnis(jobId: string): Promise<(Omit<VideoErgebnis, 'momente'> & { momente: (VideoErgebnis['momente'][number] & { pfad: string | null })[] }) | null>
  /** Vorbilder und Stilbuch je Kanal (ROADMAP 4.1) */
  vorbildListe(kontoId: string): Promise<Vorbild[]>
  vorbildHinzu(kontoId: string, quelle: { art: 'datei' } | { art: 'zwischenablage' } | { art: 'link'; url: string } | { art: 'ablegen'; pfade: string[] }): Promise<Vorbild[]>
  vorbildAendern(kontoId: string, id: string, patch: { aktiv?: boolean; gewicht?: number }): Promise<Vorbild[]>
  vorbildLoeschen(kontoId: string, id: string): Promise<Vorbild[]>
  stilbuch(kontoId: string): Promise<Stilbuch | null>
  /** Startet die Aufgabe „Vorbilder ansehen und Stilbuch erstellen“ */
  stilbuchErstellen(kontoId: string): Promise<string>
  /** Pfad einer abgelegten Datei (Drag-and-drop) */
  dateiPfad(datei: File): string
  /** Schnitt (ROADMAP M5): Projekte, Import per Dateidialog für ein Konto (null bei Abbruch), Wellenform, Löschen */
  schnittProjekte(): Promise<SchnittProjekt[]>
  schnittImport(kontoId: string): Promise<string | null>
  schnittWellenform(id: string): Promise<{ aufloesung: number; werte: number[] } | null>
  schnittLoeschen(id: string): Promise<void>
  schnittTranskript(id: string): Promise<SchnittAbschnitt[] | null>
  schnittTranskriptStart(id: string): Promise<string>
  schnittRohschnittStart(id: string): Promise<string>
  schnittListe(id: string): Promise<SchnittListe | null>
  schnittUmschalten(id: string, index: number): Promise<SchnittListe>
  schnittBereich(id: string, start: number, ende: number, raus: boolean, text?: string): Promise<SchnittListe>
  schnittWunsch(id: string, wunsch: string): Promise<string>
  /** Untertitel, Zooms, Format (16:9/9:16) und Stil-Richtung einstellen */
  schnittEinstellungen(id: string, patch: { untertitel?: 'aus' | 'an' | 'karaoke'; zooms?: boolean; format?: '16:9' | '9:16'; richtung?: string; plattform?: Plattform }): Promise<void>
  /** Effekt-Bibliothek (eigene Effekte mit Video, Greenscreen, Bild, Sound) */
  schnittBib(): Promise<BibEffektDaten[]>
  schnittBibSpeichern(e: Partial<BibEffektDaten>): Promise<BibEffektDaten>
  schnittBibLoeschen(id: string): Promise<void>
  schnittBibDatei(id: string | null, rolle: 'video' | 'bild' | 'sound', greenscreen?: boolean): Promise<BibDateiErgebnis | null>
  schnittBibVorschau(id: string, o: { video?: string; bild?: string; chroma?: BibChroma | null; zeit?: number; roh?: boolean }): Promise<string | null>
  schnittBibPipette(id: string, datei: string, x: number, y: number, zeit: number): Promise<string>
  schnittVorschau(id: string): Promise<string>
  schnittExport(id: string): Promise<string>
  schnittExportInfo(id: string): Promise<SchnittExport | null>
  schnittExportSpeichern(id: string): Promise<string | null>
  schnittThumbnail(id: string): Promise<string>
  schnittHighlightsStart(id: string): Promise<string>
  schnittHighlights(id: string): Promise<SchnittHighlight[] | null>
  schnittClips(id: string, auswahl: { index: number; art: 'clip' | 'short' }[]): Promise<string>
  schnittClipDateien(id: string): Promise<{ name: string; url: string }[]>
  schnittClipOrdner(id: string): Promise<void>
  schnittEffekte(id: string): Promise<SchnittEffekt[]>
  schnittEffektAendern(id: string, index: number, aenderung: { aus: boolean } | null): Promise<SchnittEffekt[]>
  /** Weitere Spur (Facecam, Gameplay, Ton) hinzufügen → Auftrag „ausrichten“; Versatz von Hand oder Spur entfernen (null) */
  schnittSpurHinzu(id: string, art: SpurArt): Promise<string | null>
  schnittSpurAendern(id: string, index: number, aenderung: { versatz: number } | null): Promise<void>
  /** Planung (ROADMAP M6): Karten je Konto, Änderungen vom anderen Gerät kommen als Ereignis */
  planungKarten(): Promise<PlanungKarte[]>
  planungNeu(basis: { kontoId: string; titel: string; spalte?: Spalte; termin?: string | null; notizen?: string }): Promise<PlanungKarte>
  planungAendern(id: string, aenderung: PlanungAenderung): Promise<PlanungKarte>
  planungVerschieben(id: string, ziel: { spalte: Spalte; index: number; kontoId?: string }): Promise<PlanungKarte>
  planungLoeschen(id: string): Promise<void>
  onPlanungGeaendert(handler: () => void): () => void
  /** Rohvideo für die Karte wählen und schneiden (null bei Abbruch) */
  planungSchneiden(id: string): Promise<PlanungKarte | null>
  planungThumbnail(id: string): Promise<PlanungKarte>
  planungThumbVarianten(id: string): Promise<PlanungThumbStand>
  planungThumbWaehlen(id: string, pfad: string): Promise<PlanungKarte>
  /** Ideen, Titel oder Wochenplan mit der KI → Auftrags-ID */
  planungKi(art: PlanungKiArt, o?: { kontoId?: string; wunsch?: string; karte?: string }): Promise<string>
  planungKiStand(auftrag: string): Promise<PlanungKiStand | null>
  planungCrossPlan(id: string): Promise<PlanungKarte>
  /** Upload-Paket in einen Ordner der Wahl (null bei Abbruch) */
  planungPaket(id: string): Promise<string | null>
  uploadVerbindungen(): Promise<{ plattform: 'youtube'; kontoId: string; verbunden: string }[]>
  uploadVerbinden(kontoId: string, klient: { clientId: string; clientSecret: string }): Promise<{ plattform: 'youtube'; kontoId: string; verbunden: string }[]>
  uploadTrennen(kontoId: string): Promise<{ plattform: 'youtube'; kontoId: string; verbunden: string }[]>
  uploadStart(id: string): Promise<string>
  /** Programme (ROADMAP M7): Erkennung (neu = noch einmal suchen), Selbsttest, Weitergabe eines Schnitt-Projekts */
  programmeStatus(neu?: boolean): Promise<ProgrammeStand>
  programmSelbsttest(id: ProgrammId): Promise<{ id: ProgrammId; status: 'ok' | 'fehler' | 'übersprungen' | 'checkliste'; details: string; datei: string | null }>
  schnittProgramm(id: string, ziel: SchnittZiel): Promise<{ datei: string | null; auftrag: string | null }>
  /** Leistungsbericht (ROADMAP 8.4): misst Export und Spracherkennung, gibt die Berichtsdatei zurück */
  leistungsbericht(): Promise<{ datei: string; schritte: { name: string; sekunden: number | null; wert: string }[] }>
  onLeistungStand(handler: (s: { percent: number; step: string }) => void): () => void
}
