import { cpus, release, totalmem } from 'node:os'
import { statfs } from 'node:fs/promises'
import { runHidden } from '../tools/smoke'
import type { GpuInfo, GpuVendor, HardwareInfo } from '@shared/hardware'

export type { GpuInfo, GpuVendor, HardwareInfo } from '@shared/hardware'

const VENDOR_IDS: Record<string, GpuVendor> = {
  '10DE': 'nvidia',
  '1002': 'amd',
  '1022': 'amd',
  '8086': 'intel',
  '1414': 'microsoft',
  '15AD': 'virtual', // VMware
  '1234': 'virtual', // QEMU/Bochs
  '1AF4': 'virtual', // virtio
  '80EE': 'virtual', // VirtualBox
  '1B36': 'virtual' // Red Hat QXL
}

export function vendorFromPnp(pnp: string | null | undefined, name = ''): GpuVendor {
  const m = /VEN_([0-9A-F]{4})/i.exec(pnp ?? '')
  const byId = m ? VENDOR_IDS[m[1]!.toUpperCase()] : undefined
  if (byId) return byId
  const n = name.toLowerCase()
  if (n.includes('nvidia') || n.includes('geforce') || n.includes('quadro')) return 'nvidia'
  if (n.includes('radeon') || n.includes('amd')) return 'amd'
  if (n.includes('intel')) return 'intel'
  if (n.includes('microsoft basic') || n.includes('remote display')) return 'microsoft'
  return 'other'
}

/** Werte aus der Registry können als Zahl oder als Byte-Array (REG_BINARY, little-endian) kommen. */
export function registryBytes(value: unknown): number | null {
  if (typeof value === 'number' && value > 0) return value
  if (Array.isArray(value) && value.length > 0 && value.length <= 8) {
    let n = 0
    for (let i = value.length - 1; i >= 0; i--) n = n * 256 + (Number(value[i]) & 0xff)
    return n > 0 ? n : null
  }
  return null
}

interface RawAdapter {
  name?: string
  driver?: string
  pnp?: string
  vram64?: unknown
  vram32?: unknown
}

/** Setzt aktive Grafikadapter (WMI) mit dem 64-Bit-VRAM aus der Registry zusammen. */
export function parseAdapters(active: RawAdapter[], registry: RawAdapter[]): GpuInfo[] {
  return active
    .filter((a) => a.name)
    .map((a) => {
      const reg = registry.find((r) => r.name === a.name)
      const bytes = registryBytes(reg?.vram64) ?? registryBytes(reg?.vram32)
      const vendor = vendorFromPnp(a.pnp, a.name)
      return {
        name: a.name!,
        vendor,
        vramMB: bytes ? Math.round(bytes / (1024 * 1024)) : null,
        driver: a.driver ?? null,
        physical: vendor === 'nvidia' || vendor === 'amd' || vendor === 'intel' || vendor === 'other'
      }
    })
}

const GPU_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$active = @(Get-CimInstance Win32_VideoController | ForEach-Object { [pscustomobject]@{ name = $_.Name; driver = $_.DriverVersion; pnp = $_.PNPDeviceID } })
$key = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}'
$reg = @(Get-ChildItem $key | Where-Object { $_.PSChildName -match '^\\d{4}$' } | ForEach-Object {
  $p = Get-ItemProperty $_.PSPath
  [pscustomobject]@{ name = $p.DriverDesc; vram64 = $p.'HardwareInformation.qwMemorySize'; vram32 = $p.'HardwareInformation.MemorySize' }
})
[pscustomobject]@{ active = $active; registry = $reg } | ConvertTo-Json -Depth 4 -Compress
`

export async function detectGpus(): Promise<GpuInfo[]> {
  const r = await runHidden(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', GPU_SCRIPT],
    30_000
  )
  try {
    const data = JSON.parse(r.stdout) as { active?: RawAdapter[] | RawAdapter; registry?: RawAdapter[] | RawAdapter }
    const list = <T>(v: T[] | T | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])
    return parseAdapters(list(data.active), list(data.registry))
  } catch {
    return []
  }
}

export async function detectHardware(diskPath: string): Promise<HardwareInfo> {
  const cpuList = cpus()
  let freeDiskGB = 0
  try {
    const s = await statfs(diskPath)
    freeDiskGB = Math.round(((s.bavail * s.bsize) / 1e9) * 10) / 10
  } catch {
    // Laufwerk nicht lesbar – bleibt 0
  }
  return {
    os: `Windows ${release()}`,
    cpuModel: cpuList[0]?.model.trim() ?? 'unbekannt',
    cpuThreads: cpuList.length,
    ramGB: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
    freeDiskGB,
    gpus: await detectGpus()
  }
}
