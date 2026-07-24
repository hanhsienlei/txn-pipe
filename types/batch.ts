import type { Entry } from './transaction'

/** One image in a Batch, after downscaling. */
export interface BatchImage {
  id: string
  batchId: string
  name: string
  mimeType: string
  hash: string
  blob: Blob
  createdAt: number
}

/**
 * An item in the Review Queue — exactly one human decision each.
 *
 * Every image in a batch produces at least one item: its drafts if extraction found
 * transactions, an `empty` item if it found none, or a `failed` item if extraction never
 * succeeded. An image is never absent from the queue.
 */
export type QueueItem =
  | { kind: 'entry'; id: string; imageId: string; entry: Entry }
  | { kind: 'empty'; id: string; imageId: string }
  | { kind: 'failed'; id: string; imageId: string; error: string }

export interface Batch {
  id: string
  createdAt: number
  items: QueueItem[]
}
