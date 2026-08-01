/**
 * Runs extraction across a Batch: a bounded pool of in-flight requests, with retries for
 * the failures that are worth retrying.
 *
 * Fanning out four at a time makes rate-limit responses ordinary rather than exotic, so
 * transient failures (429, 5xx, network) are retried with backoff before an image is
 * declared failed — otherwise a clean batch would show you five failure cards that only
 * needed re-sending. Hard failures (a rejected schema, a bad request) are not retried:
 * they will fail identically every time. Every image is attempted at most MAX_ATTEMPTS
 * times, so a bad batch cannot spin or run up cost.
 */
import type { Entry } from '@/types/transaction'
import type { QueueItem } from '@/types/batch'

export const DEFAULT_CONCURRENCY = 4
/** Initial attempt plus two retries. */
export const MAX_ATTEMPTS = 3

const BACKOFF_BASE_MS = 500
const BACKOFF_JITTER_MS = 250

/** Worth retrying — rate limits, server errors, dropped connections. */
export class TransientError extends Error {}
/** Not worth retrying — the same request will fail the same way. */
export class PermanentError extends Error {}

export interface ExtractInput {
  id: string
  base64: string
  mimeType: string
}

export type ExtractOutcome =
  | { id: string; ok: true; entries: Entry[] }
  | { id: string; ok: false; error: string }

export interface RunBatchOptions {
  concurrency?: number
  extractOne?: (input: ExtractInput) => Promise<Entry[]>
  onProgress?: (settled: number, total: number) => void
  /** An image has entered the pool. The extraction screen ticks its tile to "reading". */
  onImageStart?: (id: string) => void
  /** An image is finished, one way or the other, independently of the rest of the batch. */
  onImageSettled?: (outcome: ExtractOutcome) => void
  sleep?: (ms: number) => Promise<void>
  random?: () => number
}

export function backoffMs(attempt: number, random: () => number = Math.random): number {
  return BACKOFF_BASE_MS * 2 ** attempt + random() * BACKOFF_JITTER_MS
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function extractViaApi(input: ExtractInput): Promise<Entry[]> {
  let res: Response
  try {
    res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: input.base64, mimeType: input.mimeType }),
    })
  } catch {
    throw new TransientError('Network error')
  }

  const data = (await res.json().catch(() => ({}))) as { entries?: Entry[]; error?: string }

  if (!res.ok) {
    const message = data.error ?? `Extraction failed (${res.status})`
    if (res.status === 429 || res.status >= 500) throw new TransientError(message)
    throw new PermanentError(message)
  }

  return data.entries ?? []
}

async function attemptOne(
  input: ExtractInput,
  extractOne: (input: ExtractInput) => Promise<Entry[]>,
  sleep: (ms: number) => Promise<void>,
  random: () => number,
): Promise<ExtractOutcome> {
  let lastError = 'Extraction failed'

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return { id: input.id, ok: true, entries: await extractOne(input) }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      const retryable = err instanceof TransientError && attempt < MAX_ATTEMPTS - 1
      if (!retryable) break
      await sleep(backoffMs(attempt, random))
    }
  }

  return { id: input.id, ok: false, error: lastError }
}

/** Outcomes come back in input order, so the review queue matches your selection order. */
export async function runBatch(
  inputs: ExtractInput[],
  options: RunBatchOptions = {},
): Promise<ExtractOutcome[]> {
  const {
    concurrency = DEFAULT_CONCURRENCY,
    extractOne = extractViaApi,
    onProgress,
    onImageStart,
    onImageSettled,
    sleep = defaultSleep,
    random = Math.random,
  } = options

  const outcomes = new Array<ExtractOutcome>(inputs.length)
  let nextIndex = 0
  let settled = 0

  async function worker(): Promise<void> {
    for (let i = nextIndex++; i < inputs.length; i = nextIndex++) {
      onImageStart?.(inputs[i].id)
      outcomes[i] = await attemptOne(inputs[i], extractOne, sleep, random)
      onImageSettled?.(outcomes[i])
      onProgress?.(++settled, inputs.length)
    }
  }

  const workers = Math.max(1, Math.min(concurrency, inputs.length))
  await Promise.all(Array.from({ length: workers }, worker))

  return outcomes
}

/**
 * Flattens outcomes into the Review Queue. An image that produced no transactions gets an
 * `empty` item rather than vanishing — an unreadable receipt and a photo of a menu look
 * identical here, and only you can tell them apart.
 */
export function toQueueItems(outcomes: ExtractOutcome[]): QueueItem[] {
  return outcomes.flatMap<QueueItem>((outcome) => {
    if (!outcome.ok) {
      return [{ kind: 'failed' as const, id: outcome.id, imageId: outcome.id, error: outcome.error }]
    }
    if (outcome.entries.length === 0) {
      return [{ kind: 'empty' as const, id: outcome.id, imageId: outcome.id }]
    }
    return outcome.entries.map((entry, i) => ({
      kind: 'entry' as const,
      id: `${outcome.id}#${i}`,
      imageId: outcome.id,
      entry,
    }))
  })
}

/**
 * Swaps every item belonging to one image for a fresh set, in place — a retry that
 * succeeds must not jump to the bottom of a queue you're working down.
 */
export function replaceImageItems(
  items: QueueItem[],
  imageId: string,
  replacement: QueueItem[],
): QueueItem[] {
  let inserted = false
  return items.flatMap<QueueItem>((item) => {
    if (item.imageId !== imageId) return [item]
    if (inserted) return []
    inserted = true
    return replacement
  })
}
