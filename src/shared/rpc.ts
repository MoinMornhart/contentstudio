/**
 * Lokale Verbindung zwischen MCP-Server (von Claude gestartet) und laufender App:
 * Named Pipe, eine JSON-Nachricht pro Zeile, jede Anfrage trägt das Zufalls-Token aus
 * %APPDATA%\ContentStudio\pipe.json (nur für den eigenen Windows-Benutzer lesbar).
 */
export interface RpcRequest {
  id: number
  token: string
  method: string
  params?: unknown
}

export type RpcResponse = { id: number; result: unknown } | { id: number; error: string }

export interface PipeInfo {
  pipe: string
  token: string
  pid: number
  version: string
}

export function pipeName(user: string): string {
  return `\\\\.\\pipe\\contentstudio-${user.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`
}
