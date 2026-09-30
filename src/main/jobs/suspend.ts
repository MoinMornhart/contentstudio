import { constants, setPriority } from 'node:os'

/**
 * Hartes Anhalten/Fortsetzen von Kindprozessen (Blender, FFmpeg) über die Windows-Funktionen
 * NtSuspendProcess/NtResumeProcess. Wird per FFI (koffi) aufgerufen; schlägt das Laden fehl,
 * bleibt nur das kooperative Pausieren zwischen Arbeitsschritten.
 */
interface Native {
  open: (access: number, inherit: boolean, pid: number) => unknown
  close: (h: unknown) => boolean
  suspend: (h: unknown) => number
  resume: (h: unknown) => number
}

const PROCESS_SUSPEND_RESUME = 0x0800
let native: Native | null | undefined

async function load(): Promise<Native | null> {
  if (native !== undefined) return native
  try {
    const koffi = (await import('koffi')).default
    const kernel32 = koffi.load('kernel32.dll')
    const ntdll = koffi.load('ntdll.dll')
    native = {
      open: kernel32.func('void* __stdcall OpenProcess(uint32 access, bool inherit, uint32 pid)'),
      close: kernel32.func('bool __stdcall CloseHandle(void* h)'),
      suspend: ntdll.func('int32 __stdcall NtSuspendProcess(void* h)'),
      resume: ntdll.func('int32 __stdcall NtResumeProcess(void* h)')
    }
  } catch {
    native = null
  }
  return native
}

async function call(pid: number, op: 'suspend' | 'resume'): Promise<boolean> {
  const n = await load()
  if (!n) return false
  const handle = n.open(PROCESS_SUSPEND_RESUME, false, pid)
  if (!handle) return false
  try {
    return n[op](handle) === 0
  } finally {
    n.close(handle)
  }
}

export const suspendProcess = (pid: number): Promise<boolean> => call(pid, 'suspend')
export const resumeProcess = (pid: number): Promise<boolean> => call(pid, 'resume')

/** Setzt einen Prozess auf „niedriger als normal“, damit nebenbei flüssig gearbeitet werden kann. */
export function lowerPriority(pid: number): void {
  try {
    setPriority(pid, constants.priority.PRIORITY_BELOW_NORMAL)
  } catch {
    // Prozess evtl. schon beendet
  }
}
