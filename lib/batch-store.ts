/**
 * Client-side staging for a Batch.
 *
 * Review of 20 receipts takes minutes on a phone, and iOS will happily evict the tab
 * mid-way, so the batch has to survive a reload: images, the queue, and your edits all
 * live in IndexedDB rather than component state or sessionStorage (which caps out around
 * 5MB — roughly a dozen images).
 *
 * The `processed` store is the duplicate check. Only images whose entries actually reached
 * the spreadsheet are recorded, so a skipped or failed receipt stays eligible for a later
 * batch instead of being silently hidden from you forever.
 */
import type { Batch, BatchImage, QueueItem } from '@/types/batch'

/** sessionStorage key holding the id of the batch currently being reviewed. */
export const ACTIVE_BATCH_KEY = 'txnpipe_batch'

const DB_NAME = 'txnpipe'
const DB_VERSION = 1
const IMAGES = 'images'
const BATCHES = 'batches'
const PROCESSED = 'processed'

/** Batches older than this are assumed abandoned and cleaned up on next open. */
const STALE_BATCH_MS = 7 * 24 * 60 * 60 * 1000

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(IMAGES)) {
        db.createObjectStore(IMAGES, { keyPath: 'id' }).createIndex('batchId', 'batchId')
      }
      if (!db.objectStoreNames.contains(BATCHES)) {
        db.createObjectStore(BATCHES, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(PROCESSED)) {
        db.createObjectStore(PROCESSED, { keyPath: 'hash' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Could not open IndexedDB'))
  })
}

async function tx<T>(
  stores: string | string[],
  mode: IDBTransactionMode,
  fn: (t: IDBTransaction) => Promise<T>,
): Promise<T> {
  const db = await openDb()
  try {
    const t = db.transaction(stores, mode)
    const result = await fn(t)
    await new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error ?? new Error('IndexedDB transaction failed'))
      t.onabort = () => reject(t.error ?? new Error('IndexedDB transaction aborted'))
    })
    return result
  } finally {
    db.close()
  }
}

export async function saveImages(images: BatchImage[]): Promise<void> {
  await tx(IMAGES, 'readwrite', async (t) => {
    const store = t.objectStore(IMAGES)
    for (const image of images) store.put(image)
  })
}

export async function getImages(batchId: string): Promise<BatchImage[]> {
  return tx(IMAGES, 'readonly', (t) =>
    promisify(t.objectStore(IMAGES).index('batchId').getAll(batchId) as IDBRequest<BatchImage[]>),
  )
}

export async function saveBatch(batch: Batch): Promise<void> {
  await tx(BATCHES, 'readwrite', async (t) => {
    t.objectStore(BATCHES).put(batch)
  })
}

export async function saveQueue(batchId: string, items: QueueItem[]): Promise<void> {
  await tx(BATCHES, 'readwrite', async (t) => {
    const store = t.objectStore(BATCHES)
    const existing = await promisify(store.get(batchId) as IDBRequest<Batch | undefined>)
    store.put({ id: batchId, createdAt: existing?.createdAt ?? Date.now(), items })
  })
}

export async function getBatch(batchId: string): Promise<Batch | undefined> {
  return tx(BATCHES, 'readonly', (t) =>
    promisify(t.objectStore(BATCHES).get(batchId) as IDBRequest<Batch | undefined>),
  )
}

export async function deleteBatch(batchId: string): Promise<void> {
  await tx([BATCHES, IMAGES], 'readwrite', async (t) => {
    t.objectStore(BATCHES).delete(batchId)
    const index = t.objectStore(IMAGES).index('batchId')
    const keys = await promisify(index.getAllKeys(batchId))
    for (const key of keys) t.objectStore(IMAGES).delete(key)
  })
}

/** Drop batches abandoned long enough that they're clearly not coming back. */
export async function pruneStaleBatches(now = Date.now()): Promise<void> {
  const batches = await tx(BATCHES, 'readonly', (t) =>
    promisify(t.objectStore(BATCHES).getAll() as IDBRequest<Batch[]>),
  )
  for (const batch of batches) {
    if (now - batch.createdAt > STALE_BATCH_MS) await deleteBatch(batch.id)
  }
}

/** Hashes already written to the spreadsheet, mapped to when. Absent hashes are new images. */
export async function findProcessed(hashes: string[]): Promise<Map<string, number>> {
  const found = new Map<string, number>()
  await tx(PROCESSED, 'readonly', async (t) => {
    const store = t.objectStore(PROCESSED)
    await Promise.all(
      hashes.map(async (hash) => {
        const row = await promisify(
          store.get(hash) as IDBRequest<{ hash: string; savedAt: number } | undefined>,
        )
        if (row) found.set(hash, row.savedAt)
      }),
    )
  })
  return found
}

/** Call only after entries have actually reached the spreadsheet. */
export async function markProcessed(hashes: string[], savedAt = Date.now()): Promise<void> {
  await tx(PROCESSED, 'readwrite', async (t) => {
    const store = t.objectStore(PROCESSED)
    for (const hash of hashes) store.put({ hash, savedAt })
  })
}
