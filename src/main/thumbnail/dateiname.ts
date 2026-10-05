// Herkunft: MoinStudio src/main/thumbnail/dateiname.ts (MIT, v0.38.0), auf die Aufträge von ContentStudio zugeschnitten.
import { thumbnailDateiname } from '../dateinamen'
import type { JobQueue } from '../jobs/queue'
import { ladeKarten } from '../planung/karten'

/**
 * Vorschlag für „Speichern unter“ eines Thumbnails: „Thumbnail_2026-09-30_19-05.png“ mit Datum und Uhrzeit des Auftrags,
 * „_V2“ bei mehreren Varianten, „_Aenderung“ für Änderungen und das Format, wenn es nicht 16:9 ist. Hängt der Auftrag an
 * einem Video (aus dem Schnitt) oder an einer Planungskarte, steht dessen Name vorne.
 */
export async function thumbDateiname(queue: JobQueue, daten: string | null, jobId: string, index: number, endung: string, format = '16:9'): Promise<string> {
  const job = queue.get(jobId)
  const zeit = job ? new Date(job.createdAt) : new Date()
  const varianten = queue.result<{ varianten: unknown[] }>(jobId)?.varianten?.length ?? 1
  const payload = queue.payload<{ titel?: string; basis?: unknown }>(jobId)
  let video = typeof payload?.titel === 'string' && payload.titel.trim() ? payload.titel : null
  if (!video && daten) video = (await ladeKarten(daten).catch(() => [])).find((k) => k.thumbnail?.auftrag === jobId)?.titel ?? null
  const name = thumbnailDateiname({ video, zeit, variante: index, varianten, aenderung: job?.kind === 'aenderung' ? 1 : null, endung })
  return format === '16:9' ? name : name.replace(/(\.[a-z]+)$/, `_${format.replace(':', 'x')}$1`)
}
