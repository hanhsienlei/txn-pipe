'use client'

import { useEffect, useState, startTransition } from 'react'
import { useRouter } from 'next/navigation'
import EntryForm from '@/components/EntryForm'
import { blobToBase64 } from '@/lib/image'
import { runBatch, toQueueItems, replaceImageItems } from '@/lib/extract-batch'
import {
  ACTIVE_BATCH_KEY,
  getBatch,
  getImages,
  saveQueue,
  deleteBatch,
  markProcessed,
} from '@/lib/batch-store'
import type { BatchImage, QueueItem } from '@/types/batch'
import type { Entry } from '@/types/transaction'
import type { AppendOutcome, TabName } from '@/lib/sheets'

type EntryItem = Extract<QueueItem, { kind: 'entry' }>

function isEntryItem(item: QueueItem): item is EntryItem {
  return item.kind === 'entry'
}

function tabOf(entry: Entry): TabName {
  return entry.type === 'income' ? 'income' : 'expense'
}

function describe(entry: Entry): string {
  return entry.type === 'income' ? entry.income : entry.expense
}

export default function ReviewPage() {
  const router = useRouter()
  const [batchId, setBatchId] = useState<string | null>(null)
  const [items, setItems] = useState<QueueItem[]>([])
  const [images, setImages] = useState<Record<string, BatchImage>>({})
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [retrying, setRetrying] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const created: string[] = []

    async function load() {
      const id = sessionStorage.getItem(ACTIVE_BATCH_KEY)
      if (!id) {
        router.replace('/')
        return
      }
      const [batch, batchImages] = await Promise.all([getBatch(id), getImages(id)])
      if (cancelled) return
      if (!batch?.items.length) {
        router.replace('/')
        return
      }

      const imageMap: Record<string, BatchImage> = {}
      const urlMap: Record<string, string> = {}
      for (const image of batchImages) {
        imageMap[image.id] = image
        urlMap[image.id] = URL.createObjectURL(image.blob)
        created.push(urlMap[image.id])
      }

      startTransition(() => {
        setBatchId(id)
        setItems(batch.items)
        setImages(imageMap)
        setUrls(urlMap)
        setStatus('ready')
      })
    }

    void load()
    return () => {
      cancelled = true
      for (const url of created) URL.revokeObjectURL(url)
    }
  }, [router])

  function persist(next: QueueItem[]) {
    setItems(next)
    if (batchId) void saveQueue(batchId, next)
  }

  function handleEdit(itemId: string, entry: Entry) {
    persist(items.map((item) => (item.id === itemId && item.kind === 'entry' ? { ...item, entry } : item)))
  }

  /** Dismissing an unusable image. The image stays unprocessed, so it can come back in a later batch. */
  function handleDismiss(imageId: string) {
    const next = items.filter((item) => item.imageId !== imageId)
    if (!next.length) {
      if (batchId) void deleteBatch(batchId)
      sessionStorage.removeItem(ACTIVE_BATCH_KEY)
      router.push('/')
      return
    }
    persist(next)
  }

  async function handleRetry(imageId: string) {
    const image = images[imageId]
    if (!image) return
    setRetrying(imageId)
    setError(null)
    try {
      const base64 = await blobToBase64(image.blob)
      const outcomes = await runBatch([{ id: imageId, base64, mimeType: image.mimeType }])
      persist(replaceImageItems(items, imageId, toQueueItems(outcomes)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed')
    } finally {
      setRetrying(null)
    }
  }

  function recordSaved(saved: QueueItem[]) {
    const entries = saved.flatMap((item) => (item.kind === 'entry' ? [item.entry] : []))
    const history: Entry[] = JSON.parse(localStorage.getItem('txnpipe_history') ?? '[]')
    history.unshift(...entries)
    localStorage.setItem('txnpipe_history', JSON.stringify(history.slice(0, 100)))

    // An image counts as processed only once every entry it produced has been written —
    // otherwise a half-saved receipt would be hidden from you as a duplicate next time.
    const savedIds = new Set(saved.map((item) => item.imageId))
    const stillPending = new Set(
      items.filter((item) => !saved.includes(item)).map((item) => item.imageId),
    )
    const hashes = [...savedIds]
      .filter((imageId) => !stillPending.has(imageId))
      .map((imageId) => images[imageId]?.hash)
      .filter((hash): hash is string => Boolean(hash))

    if (hashes.length) void markProcessed(hashes)
  }

  async function handleSave() {
    const entryItems = items.filter(isEntryItem)
    if (!entryItems.length) return

    setStatus('saving')
    setError(null)
    try {
      const res = await fetch('/api/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: entryItems.map((item) => item.entry) }),
      })
      const data = (await res.json()) as {
        success?: boolean
        outcomes?: AppendOutcome[]
        error?: string
      }

      if (!res.ok) {
        // A partial write means one tab landed and the other didn't. Drop what was
        // written from the queue so tapping Save again can't duplicate those rows.
        const written = new Set((data.outcomes ?? []).filter((o) => o.ok).map((o) => o.tab))
        if (written.size) {
          const saved = entryItems.filter((item) => written.has(tabOf(item.entry)))
          const savedIds = new Set(saved.map((item) => item.id))
          recordSaved(saved)
          persist(items.filter((item) => !savedIds.has(item.id)))
        }
        const failed = (data.outcomes ?? []).filter((o) => !o.ok)
        setError(
          failed.length
            ? `${failed.map((o) => `${o.count} ${o.tab} row${o.count === 1 ? '' : 's'}`).join(' and ')} failed to save — tap Save to retry.`
            : (data.error ?? 'Could not save'),
        )
        setStatus('ready')
        return
      }

      recordSaved(entryItems)
      if (batchId) await deleteBatch(batchId)
      sessionStorage.removeItem(ACTIVE_BATCH_KEY)
      router.push('/')
    } catch {
      setError('Network error. Please try again.')
      setStatus('ready')
    }
  }

  if (status === 'loading') {
    return (
      <main className="flex items-center justify-center min-h-dvh">
        <p className="text-neutral-400 text-sm">Loading…</p>
      </main>
    )
  }

  const entryCount = items.filter((item) => item.kind === 'entry').length
  const unresolved = items.filter((item) => item.kind !== 'entry').length

  return (
    <main className="flex flex-col min-h-dvh">
      <header className="px-5 pt-12 pb-4">
        <h1 className="text-xl font-bold tracking-tight">Review</h1>
        <p className="text-sm text-neutral-500 mt-1">
          {entryCount} transaction{entryCount === 1 ? '' : 's'} from {Object.keys(images).length}{' '}
          image{Object.keys(images).length === 1 ? '' : 's'} — check before saving.
        </p>
      </header>

      <div className="flex-1 px-5 pb-32 flex flex-col gap-3">
        {items.map((item) => {
          const url = urls[item.imageId]
          const busy = retrying === item.imageId

          if (item.kind === 'entry') {
            const isOpen = expanded === item.id
            return (
              <div key={item.id} className="border border-neutral-200 rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : item.id)}
                  className="w-full flex items-center gap-3 p-3 text-left"
                  aria-expanded={isOpen}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {url && <img src={url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{describe(item.entry)}</p>
                    <p className="text-xs text-neutral-500">
                      {item.entry.date} ·{' '}
                      {item.entry.type === 'income' ? item.entry.source : item.entry.category}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums shrink-0">
                    {item.entry.type === 'income' ? '+' : ''}
                    {item.entry.amount} {item.entry.currency}
                  </span>
                </button>

                {isOpen && (
                  <div className="px-3 pb-3 border-t border-neutral-100 pt-3">
                    <EntryForm
                      initial={item.entry}
                      onChange={(entry) => handleEdit(item.id, entry)}
                      onSubmit={() => setExpanded(null)}
                      onRetake={() => setExpanded(null)}
                      hideActions
                    />
                    <div className="flex gap-3 pt-3">
                      <button
                        type="button"
                        onClick={() => persist(items.filter((i) => i.id !== item.id))}
                        className="flex-1 py-2.5 rounded-xl border border-neutral-300 text-sm font-medium text-red-500"
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpanded(null)}
                        className="flex-1 py-2.5 rounded-xl bg-neutral-900 text-white text-sm font-medium"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          }

          const isFailure = item.kind === 'failed'
          return (
            <div
              key={item.id}
              className={`border rounded-2xl p-3 flex items-center gap-3 ${
                isFailure ? 'border-red-200 bg-red-50/50' : 'border-amber-200 bg-amber-50/50'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {url && <img src={url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {isFailure ? 'Extraction failed' : 'No transactions found'}
                </p>
                <p className="text-xs text-neutral-500 truncate">
                  {isFailure ? item.error : 'Blurry receipt, or not a receipt at all.'}
                </p>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleRetry(item.imageId)}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-medium disabled:opacity-50"
                >
                  {busy ? '…' : 'Retry'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDismiss(item.imageId)}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg border border-neutral-300 text-xs font-medium"
                >
                  {isFailure ? 'Skip' : 'Not a receipt'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="fixed bottom-0 inset-x-0 px-5 pb-8 pt-4 bg-gradient-to-t from-white via-white to-transparent">
        {error && <p className="mb-3 text-sm text-red-500 text-center">{error}</p>}
        {unresolved > 0 && (
          <p className="mb-3 text-xs text-neutral-500 text-center">
            {unresolved} image{unresolved === 1 ? '' : 's'} still need{unresolved === 1 ? 's' : ''} a
            decision before saving.
          </p>
        )}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={status === 'saving' || unresolved > 0 || entryCount === 0}
          className="w-full py-3.5 rounded-2xl bg-neutral-900 text-white font-semibold text-sm disabled:opacity-40"
        >
          {status === 'saving' ? 'Saving…' : `Save All (${entryCount})`}
        </button>
      </div>
    </main>
  )
}
