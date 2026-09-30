import { describe, expect, it } from 'vitest'
import { classifyExit, parseFfmpegFps, type EncoderBench, type RenderBench } from '../../src/main/hardware/bench'
import { decideConfig, onnxProvider } from '../../src/main/hardware/decide'
import { parseAdapters, registryBytes, vendorFromPnp, type HardwareInfo } from '../../src/main/hardware/detect'
import { fingerprint } from '../../src/main/hardware/profile'

const hw = (over: Partial<HardwareInfo> = {}): HardwareInfo => ({
  os: 'Windows 10.0.26200',
  cpuModel: 'Test CPU',
  cpuThreads: 16,
  ramGB: 32,
  freeDiskGB: 200,
  gpus: [],
  ...over
})

const r = (blender: string, engine: RenderBench['engine'], device: RenderBench['device'], seconds: number | null, extra: Partial<RenderBench> = {}): RenderBench => ({
  blender,
  engine,
  device,
  mesa: false,
  ok: seconds !== null,
  seconds,
  ...(seconds === null ? { reason: 'crash' as const } : {}),
  ...extra
})

const enc = (ok: Record<string, number | null>): EncoderBench[] =>
  Object.entries(ok).map(([encoder, fps]) => ({ encoder, ok: fps !== null, fps }))

describe('decideConfig – simulierte Geräte', () => {
  it('Gaming-PC mit NVIDIA: Cycles OptiX, NVENC, Whisper large auf CUDA, FLUX', () => {
    const c = decideConfig(
      hw({ gpus: [{ name: 'NVIDIA GeForce RTX 4080', vendor: 'nvidia', vramMB: 16376, driver: '32.0', physical: true }] }),
      [r('5.2.2', 'WORKBENCH', 'CPU', 0.4), r('5.2.2', 'EEVEE', 'CPU', 0.9), r('5.2.2', 'CYCLES', 'OPTIX', 0.8), r('5.2.2', 'CYCLES', 'CUDA', 1.1), r('5.2.2', 'CYCLES', 'CPU', 6)],
      enc({ h264_nvenc: 900, h264_amf: null, h264_qsv: null, libx264: 180 })
    )
    expect(c.blenderVersion).toBe('5.2.2')
    expect(c.final).toMatchObject({ engine: 'CYCLES', device: 'OPTIX', width: 1920, height: 1080 })
    expect(c.preview.engine).toBe('WORKBENCH')
    expect(c.encoder).toBe('h264_nvenc')
    expect(c.whisper).toEqual({ model: 'large-v3-turbo', device: 'cuda', compute: 'float16' })
    expect(c.imageModels).toBe('flux')
    expect(c.blenderMesa).toBe(false)
  })

  it('AMD-Rechner: Cycles HIP, AMF, Whisper auf CPU, SDXL', () => {
    const c = decideConfig(
      hw({ gpus: [{ name: 'AMD Radeon RX 7600', vendor: 'amd', vramMB: 8176, driver: '31.0', physical: true }] }),
      [r('5.2.2', 'WORKBENCH', 'CPU', 0.5), r('5.2.2', 'EEVEE', 'CPU', 1.2), r('5.2.2', 'CYCLES', 'HIP', 1.4), r('5.2.2', 'CYCLES', 'CPU', 7)],
      enc({ h264_nvenc: null, h264_amf: 600, h264_qsv: null, libx264: 150 })
    )
    expect(c.final).toMatchObject({ engine: 'CYCLES', device: 'HIP' })
    expect(c.encoder).toBe('h264_amf')
    expect(c.whisper.device).toBe('cpu')
    expect(c.imageModels).toBe('sdxl')
  })

  it('Laptop mit Intel-Grafik: EEVEE als Endbild wenn Cycles CPU zu langsam, QSV, keine Bildmodelle', () => {
    const c = decideConfig(
      hw({ cpuThreads: 8, ramGB: 16, gpus: [{ name: 'Intel(R) Iris(R) Xe Graphics', vendor: 'intel', vramMB: 128, driver: '31.0', physical: true }] }),
      [r('5.2.2', 'WORKBENCH', 'CPU', 0.8), r('5.2.2', 'EEVEE', 'CPU', 2.5), r('5.2.2', 'CYCLES', 'CPU', 14)],
      enc({ h264_nvenc: null, h264_amf: null, h264_qsv: 400, libx264: 90 })
    )
    expect(c.final.engine).toBe('EEVEE')
    expect(c.encoder).toBe('h264_qsv')
    expect(c.whisper).toEqual({ model: 'small', device: 'cpu', compute: 'int8' })
    expect(c.imageModels).toBe('off')
  })

  it('Rechner ohne GPU: Mesa für Vorschau, Cycles CPU wenn im Zeitbudget, x264', () => {
    const c = decideConfig(
      hw({ cpuThreads: 4, ramGB: 8, gpus: [{ name: 'Microsoft Basic Display Adapter', vendor: 'microsoft', vramMB: null, driver: null, physical: false }] }),
      [
        r('5.2.2', 'WORKBENCH', 'CPU', null),
        r('5.2.2', 'EEVEE', 'CPU', null),
        r('5.2.2', 'CYCLES', 'CPU', 2.5),
        r('5.2.2', 'WORKBENCH', 'CPU', 0.9, { mesa: true }),
        r('5.2.2', 'EEVEE', 'CPU', 9, { mesa: true })
      ],
      enc({ h264_nvenc: null, h264_amf: null, h264_qsv: null, libx264: 60 })
    )
    expect(c.blenderMesa).toBe(true)
    expect(c.preview.engine).toBe('WORKBENCH')
    expect(c.final).toMatchObject({ engine: 'CYCLES', device: 'CPU' })
    expect(c.encoder).toBe('libx264')
  })

  it('Entwicklungs-VM: 5.2 stürzt ab (RDTSCP) → 4.5 wird genutzt', () => {
    const c = decideConfig(
      hw({ cpuThreads: 4, ramGB: 9, gpus: [] }),
      [
        r('5.2.2', 'CYCLES', 'CPU', null, { reason: 'illegal-instruction' }),
        r('5.2.2', 'WORKBENCH', 'CPU', null),
        r('4.5.9', 'CYCLES', 'CPU', 3),
        r('4.5.9', 'WORKBENCH', 'CPU', 1, { mesa: true })
      ],
      enc({ libx264: 50 })
    )
    expect(c.blenderVersion).toBe('4.5.9')
    expect(c.notes.map((n) => n.key)).toContain('hw.notiz.neueresBlender')
  })

  it('bevorzugt die Version, auf der Cycles läuft, vor einer neueren ohne Cycles', () => {
    const c = decideConfig(hw(), [r('5.2.2', 'EEVEE', 'CPU', 1), r('4.5.9', 'CYCLES', 'CPU', 3)], enc({ libx264: 50 }))
    expect(c.blenderVersion).toBe('4.5.9')
  })

  it('meldet, wenn Blender gar nicht rendern kann', () => {
    const c = decideConfig(hw(), [r('5.2.2', 'CYCLES', 'CPU', null)], [])
    expect(c.blenderVersion).toBeNull()
    expect(c.encoder).toBe('libx264')
    expect(c.notes[0]?.key).toBe('hw.notiz.keinBlender')
  })
})

describe('Erkennung', () => {
  it('erkennt Hersteller aus PNP-ID oder Namen', () => {
    expect(vendorFromPnp('PCI\\VEN_10DE&DEV_2704')).toBe('nvidia')
    expect(vendorFromPnp('PCI\\VEN_1002&DEV_7480')).toBe('amd')
    expect(vendorFromPnp('PCI\\VEN_8086&DEV_A7A0')).toBe('intel')
    expect(vendorFromPnp('PCI\\VEN_1234&DEV_1111')).toBe('virtual')
    expect(vendorFromPnp(null, 'Microsoft Basic Display Adapter')).toBe('microsoft')
  })

  it('liest VRAM als QWORD oder REG_BINARY und nimmt 64-Bit vor 32-Bit', () => {
    expect(registryBytes(17179869184)).toBe(17179869184)
    expect(registryBytes([0, 0, 0, 128])).toBe(2147483648)
    expect(registryBytes(null)).toBeNull()
    const gpus = parseAdapters(
      [{ name: 'NVIDIA GeForce RTX 4080', pnp: 'PCI\\VEN_10DE', driver: '32.0' }, { name: 'Microsoft Basic Display Adapter', pnp: 'ROOT\\BasicDisplay' }],
      [{ name: 'NVIDIA GeForce RTX 4080', vram64: 17171480576, vram32: [0, 0, 0, 0] }]
    )
    expect(gpus[0]).toMatchObject({ vendor: 'nvidia', vramMB: 16376, physical: true })
    expect(gpus[1]).toMatchObject({ vendor: 'microsoft', vramMB: null, physical: false })
  })
})

describe('Mess-Hilfen', () => {
  it('ordnet Windows-Absturzcodes zu', () => {
    expect(classifyExit(-1073741795, '')).toBe('illegal-instruction') // 0xC000001D
    expect(classifyExit(132, 'Illegal instruction')).toBe('illegal-instruction')
    expect(classifyExit(-1073741819, '')).toBe('crash') // 0xC0000005
    expect(classifyExit(null, '')).toBe('timeout')
  })

  it('liest fps aus der FFmpeg-Ausgabe', () => {
    expect(parseFfmpegFps('frame=  30 fps= 12 q=-0.0\rframe=   90 fps=245.3 q=-0.0 Lsize=N/A')).toBe(245.3)
    expect(parseFfmpegFps('kein fortschritt')).toBeNull()
  })

  it('Fingerabdruck ändert sich bei neuer GPU/Treiber/Minor-Version, nicht bei Patch-Version', () => {
    const base = hw({ gpus: [{ name: 'GPU', vendor: 'nvidia', vramMB: 8000, driver: '1', physical: true }] })
    const a = fingerprint(base, '0.1.3', ['5.2.2'])
    expect(fingerprint(base, '0.1.9', ['5.2.2'])).toBe(a)
    expect(fingerprint(base, '0.2.0', ['5.2.2'])).not.toBe(a)
    expect(fingerprint({ ...base, gpus: [{ ...base.gpus[0]!, driver: '2' }] }, '0.1.3', ['5.2.2'])).not.toBe(a)
    expect(fingerprint(base, '0.1.3', ['5.2.2', '4.5.9'])).not.toBe(a)
  })
})

describe('decideConfig – Zeitbudget', () => {
  it('nimmt auf der VM Cycles CPU mit 32 Samples statt eines 30-Minuten-EEVEE über Mesa', () => {
    const c = decideConfig(
      hw({ cpuThreads: 4, ramGB: 9 }),
      [
        { blender: '4.5.9', engine: 'CYCLES', device: 'CPU', mesa: false, ok: true, seconds: 4.6 },
        { blender: '4.5.9', engine: 'WORKBENCH', device: 'CPU', mesa: true, ok: true, seconds: 2.7 },
        { blender: '4.5.9', engine: 'EEVEE', device: 'CPU', mesa: true, ok: true, seconds: 32 }
      ],
      []
    )
    expect(c.final).toMatchObject({ engine: 'CYCLES', device: 'CPU', samples: 32 })
    expect(c.finalSecondsEstimate).toBeLessThan(180)
    expect(c.preview.engine).toBe('WORKBENCH')
    expect(c.blenderMesa).toBe(true)
  })

  it('nimmt den schnellsten Weg, wenn keiner ins Budget passt', () => {
    const c = decideConfig(
      hw(),
      [
        { blender: '5.2.2', engine: 'CYCLES', device: 'CPU', mesa: false, ok: true, seconds: 40 },
        { blender: '5.2.2', engine: 'EEVEE', device: 'CPU', mesa: false, ok: true, seconds: 20 }
      ],
      []
    )
    expect(c.final.engine).toBe('EEVEE')
    expect(c.notes.map((n) => n.key)).toContain('hw.notiz.langsam')
  })
})

describe('ContentStudio: Blender nur bei 3D, ONNX-Anbieter', () => {
  it('ohne 3D bleibt Blender aus, ohne Fehlermeldung', () => {
    const c = decideConfig(hw(), [], enc({ libx264: 50 }), false)
    expect(c.blenderVersion).toBeNull()
    expect(c.blenderUebersprungen).toBe(true)
    expect(c.notes.map((n) => n.key)).toContain('hw.notiz.blenderAus')
    expect(c.notes.map((n) => n.key)).not.toContain('hw.notiz.keinBlender')
  })

  it('wählt CUDA, DirectML oder CPU nach Grafikkarte', () => {
    const gpu = (vendor: 'nvidia' | 'amd' | 'intel' | 'microsoft', vramMB: number, physical = true) => ({ name: vendor, vendor, vramMB, driver: null, physical })
    expect(onnxProvider(hw({ gpus: [gpu('nvidia', 8192)] }))).toBe('cuda')
    expect(onnxProvider(hw({ gpus: [gpu('nvidia', 2048)] }))).toBe('directml')
    expect(onnxProvider(hw({ gpus: [gpu('amd', 16384)] }))).toBe('directml')
    expect(onnxProvider(hw({ gpus: [gpu('intel', 0)] }))).toBe('directml')
    expect(onnxProvider(hw({ gpus: [gpu('microsoft', 0, false)] }))).toBe('cpu')
    expect(onnxProvider(hw())).toBe('cpu')
  })
})
