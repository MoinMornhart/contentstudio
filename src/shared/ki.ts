/** KI-Wege für Oberfläche und Hauptprozess (ROADMAP M3). Welche Wege es gibt und warum: docs/ki-anbieter.md */

export type KiWegArt = 'abo' | 'lokal' | 'api' | 'desktop'

export interface KiWegInfo {
  id: string
  art: KiWegArt
  /** Anzeigename (Produktname des Anbieters, nur als Text) */
  name: string
  /** Wohin Daten gehen (für die Datenschutz-Anzeige) */
  ziel: string
  /** Braucht einen API-Schlüssel, den die Person selbst einträgt */
  schluessel: boolean
  /** Link zur offiziellen Seite (Installation bzw. Schlüssel anlegen) */
  link: string
}

/** Alle Wege, die ContentStudio kennt, in der vorgeschlagenen Reihenfolge (kostenlos und lokal zuerst) */
export const KI_WEGE: KiWegInfo[] = [
  { id: 'ollama', art: 'lokal', name: 'Ollama', ziel: 'localhost:11434', schluessel: false, link: 'https://ollama.com/download' },
  { id: 'lmstudio', art: 'lokal', name: 'LM Studio', ziel: 'localhost:1234', schluessel: false, link: 'https://lmstudio.ai' },
  { id: 'llamacpp', art: 'lokal', name: 'llama.cpp', ziel: 'localhost:8080', schluessel: false, link: 'https://github.com/ggml-org/llama.cpp' },
  { id: 'codex-cli', art: 'abo', name: 'ChatGPT (Codex CLI)', ziel: 'OpenAI', schluessel: false, link: 'https://developers.openai.com/codex/cli' },
  { id: 'api-anthropic', art: 'api', name: 'Anthropic API (Claude)', ziel: 'api.anthropic.com', schluessel: true, link: 'https://console.anthropic.com/settings/keys' },
  { id: 'api-openai', art: 'api', name: 'OpenAI API', ziel: 'api.openai.com', schluessel: true, link: 'https://platform.openai.com/api-keys' },
  { id: 'api-google', art: 'api', name: 'Google Gemini API', ziel: 'generativelanguage.googleapis.com', schluessel: true, link: 'https://aistudio.google.com/apikey' },
  { id: 'api-openrouter', art: 'api', name: 'OpenRouter', ziel: 'openrouter.ai', schluessel: true, link: 'https://openrouter.ai/settings/keys' }
]

/** Zustand eines Weges für die Oberfläche */
export interface KiWegStand {
  id: string
  installiert: boolean
  bereit: boolean
  hinweis: string | null
  modelle: string[]
  bilderSehen: boolean
  hatSchluessel: boolean
}

/** MCP-fähige Desktop-Apps, die ContentStudio als Werkzeug nutzen können (ROADMAP 3.7) */
export interface McpZiel {
  id: 'claude-desktop' | 'chatgpt-desktop'
  name: string
  installiert: boolean
  /** In mindestens einer gefundenen Konfiguration eingetragen und aktuell */
  verbunden: boolean
  /** Kann ContentStudio den Eintrag selbst vornehmen? (sonst Anleitung zum Selbst-Eintragen) */
  automatisch: boolean
}
