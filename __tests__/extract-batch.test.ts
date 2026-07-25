import { describe, it, expect, vi } from 'vitest'
import {
  runBatch,
  toQueueItems,
  replaceImageItems,
  TransientError,
  PermanentError,
  MAX_ATTEMPTS,
  type ExtractInput,
  type ExtractOutcome,
} from '@/lib/extract-batch'
import type { Entry } from '@/types/transaction'
import type { QueueItem } from '@/types/batch'

const noSleep = () => Promise.resolve()

function inputs(n: number): ExtractInput[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `img-${i}`,
    base64: 'x',
    mimeType: 'image/jpeg',
  }))
}

function expense(description: string): Entry {
  return {
    type: 'expense',
    expense: description,
    amount: 1,
    date: '2026-07-01',
    account: 'NAB AUD',
    category: 'Other',
    currency: 'AUD',
  }
}

describe('runBatch', () => {
  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0
    let peak = 0

    await runBatch(inputs(12), {
      concurrency: 4,
      sleep: noSleep,
      extractOne: async () => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await Promise.resolve()
        inFlight--
        return []
      },
    })

    expect(peak).toBeLessThanOrEqual(4)
  })

  it('returns outcomes in input order regardless of completion order', async () => {
    const delays: Record<string, number> = { 'img-0': 3, 'img-1': 1, 'img-2': 2 }
    const outcomes = await runBatch(inputs(3), {
      concurrency: 3,
      sleep: noSleep,
      extractOne: async (input) => {
        for (let i = 0; i < delays[input.id]; i++) await Promise.resolve()
        return [expense(input.id)]
      },
    })

    expect(outcomes.map((o) => o.id)).toEqual(['img-0', 'img-1', 'img-2'])
  })

  it('retries transient failures and succeeds', async () => {
    const extractOne = vi
      .fn<(input: ExtractInput) => Promise<Entry[]>>()
      .mockRejectedValueOnce(new TransientError('rate limited'))
      .mockResolvedValueOnce([expense('Coffee')])

    const [outcome] = await runBatch(inputs(1), { sleep: noSleep, extractOne })

    expect(extractOne).toHaveBeenCalledTimes(2)
    expect(outcome.ok).toBe(true)
  })

  it('gives up on a transient failure after MAX_ATTEMPTS and reports the last error', async () => {
    const extractOne = vi.fn().mockRejectedValue(new TransientError('rate limited'))

    const [outcome] = await runBatch(inputs(1), { sleep: noSleep, extractOne })

    expect(extractOne).toHaveBeenCalledTimes(MAX_ATTEMPTS)
    expect(outcome).toEqual({ id: 'img-0', ok: false, error: 'rate limited' })
  })

  it('does not retry permanent failures', async () => {
    const extractOne = vi.fn().mockRejectedValue(new PermanentError('schema rejected'))

    const [outcome] = await runBatch(inputs(1), { sleep: noSleep, extractOne })

    expect(extractOne).toHaveBeenCalledTimes(1)
    expect(outcome.ok).toBe(false)
  })

  it('lets one image fail without taking the batch down', async () => {
    const outcomes = await runBatch(inputs(3), {
      sleep: noSleep,
      extractOne: async (input) => {
        if (input.id === 'img-1') throw new PermanentError('bad image')
        return [expense(input.id)]
      },
    })

    expect(outcomes.map((o) => o.ok)).toEqual([true, false, true])
  })

  it('reports progress once per settled image', async () => {
    const seen: number[] = []
    await runBatch(inputs(3), {
      sleep: noSleep,
      extractOne: async () => [],
      onProgress: (done, total) => {
        seen.push(done)
        expect(total).toBe(3)
      },
    })

    expect(seen).toEqual([1, 2, 3])
  })
})

describe('toQueueItems', () => {
  it('gives every image an item, including ones with no transactions', () => {
    const outcomes: ExtractOutcome[] = [
      { id: 'a', ok: true, entries: [expense('One'), expense('Two')] },
      { id: 'b', ok: true, entries: [] },
      { id: 'c', ok: false, error: 'boom' },
    ]

    const items = toQueueItems(outcomes)

    expect(items.map((i) => i.kind)).toEqual(['entry', 'entry', 'empty', 'failed'])
    expect(new Set(items.map((i) => i.imageId))).toEqual(new Set(['a', 'b', 'c']))
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
  })
})

describe('replaceImageItems', () => {
  const items: QueueItem[] = [
    { kind: 'entry', id: 'a#0', imageId: 'a', entry: expense('One') },
    { kind: 'failed', id: 'b', imageId: 'b', error: 'boom' },
    { kind: 'entry', id: 'c#0', imageId: 'c', entry: expense('Three') },
  ]

  it('swaps an image’s items in place', () => {
    const next = replaceImageItems(items, 'b', [
      { kind: 'entry', id: 'b#0', imageId: 'b', entry: expense('Recovered') },
    ])

    expect(next.map((i) => i.id)).toEqual(['a#0', 'b#0', 'c#0'])
  })

  it('collapses several items for one image into the replacement', () => {
    const multi: QueueItem[] = [
      { kind: 'entry', id: 'a#0', imageId: 'a', entry: expense('One') },
      { kind: 'entry', id: 'a#1', imageId: 'a', entry: expense('Two') },
      { kind: 'entry', id: 'z#0', imageId: 'z', entry: expense('Zed') },
    ]

    const next = replaceImageItems(multi, 'a', [
      { kind: 'failed', id: 'a', imageId: 'a', error: 'boom' },
    ])

    expect(next.map((i) => i.id)).toEqual(['a', 'z#0'])
  })
})
