'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import PhotoCapture from '@/components/PhotoCapture'
import { dbg } from '@/components/DebugLog'
import { prepareImage, blobToBase64, type PreparedImage } from '@/lib/image'
import { runBatch, toQueueItems } from '@/lib/extract-batch'
import {
  ACTIVE_BATCH_KEY,
  findProcessed,
  saveImages,
  saveBatch,
  saveQueue,
  pruneStaleBatches,
} from '@/lib/batch-store'
import type { BatchImage } from '@/types/batch'

interface Candidate {
  key: string
  name: string
  prepared: PreparedImage
  previewUrl: string
  /** When this exact image was last written to the sheet, if it has been. */
  duplicateAt?: number
  selected: boolean
}

type Stage = 'idle' | 'preparing' | 'selecting' | 'extracting'

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export default function HomePage() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('idle')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)

  function reset(list: Candidate[]) {
    for (const c of list) URL.revokeObjectURL(c.previewUrl)
    setCandidates([])
    setStage('idle')
    setProgress({ done: 0, total: 0 })
  }

  async function handleFiles(files: File[]) {
    setError(null)
    setStage('preparing')
    setProgress({ done: 0, total: files.length })

    let prepared: Candidate[] = []
    try {
      // Sequentially: a dozen full-resolution bitmaps decoded at once is hundreds of MB
      // of pixel buffers, which is how you get an out-of-memory kill on a phone.
      for (const [i, file] of files.entries()) {
        const image = await prepareImage(file)
        prepared.push({
          key: `${i}-${file.name}`,
          name: file.name,
          prepared: image,
          previewUrl: URL.createObjectURL(image.blob),
          selected: true,
        })
        setProgress({ done: i + 1, total: files.length })
      }

      const processed = await findProcessed(prepared.map((c) => c.prepared.hash))
      prepared = prepared.map((c) => {
        const duplicateAt = processed.get(c.prepared.hash)
        return { ...c, duplicateAt, selected: duplicateAt === undefined }
      })
    } catch (err) {
      dbg('ERR prepare:', String(err))
      reset(prepared)
      setError(err instanceof Error ? err.message : 'Could not read those images')
      return
    }

    // One new receipt is the everyday case — don't make it tap a confirm screen.
    if (prepared.length === 1 && prepared[0].selected) {
      setCandidates(prepared)
      void startExtraction(prepared)
      return
    }

    setCandidates(prepared)
    setStage('selecting')
  }

  function toggle(key: string) {
    setCandidates((prev) =>
      prev.map((c) => (c.key === key ? { ...c, selected: !c.selected } : c)),
    )
  }

  async function startExtraction(list: Candidate[]) {
    const chosen = list.filter((c) => c.selected)
    if (!chosen.length) return

    setStage('extracting')
    setProgress({ done: 0, total: chosen.length })
    setError(null)

    const batchId = crypto.randomUUID()
    const createdAt = Date.now()
    const images: BatchImage[] = chosen.map((c, i) => ({
      id: `${batchId}-${i}`,
      batchId,
      name: c.name,
      mimeType: c.prepared.mimeType,
      hash: c.prepared.hash,
      blob: c.prepared.blob,
      createdAt,
    }))

    try {
      await pruneStaleBatches()
      await saveImages(images)
      await saveBatch({ id: batchId, createdAt, items: [] })

      const inputs = await Promise.all(
        images.map(async (image) => ({
          id: image.id,
          base64: await blobToBase64(image.blob),
          mimeType: image.mimeType,
        })),
      )

      const outcomes = await runBatch(inputs, {
        onProgress: (done, total) => setProgress({ done, total }),
      })

      await saveQueue(batchId, toQueueItems(outcomes))
      sessionStorage.setItem(ACTIVE_BATCH_KEY, batchId)
      for (const c of list) URL.revokeObjectURL(c.previewUrl)
      router.push('/review')
    } catch (err) {
      dbg('ERR batch:', String(err))
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setStage('selecting')
    }
  }

  const busy = stage === 'preparing' || stage === 'extracting'
  const selectedCount = candidates.filter((c) => c.selected).length
  const duplicateCount = candidates.filter((c) => c.duplicateAt !== undefined).length

  return (
    <main className="flex flex-col min-h-dvh">
      <header className="flex items-center justify-between px-5 pt-12 pb-4">
        <h1 className="text-xl font-bold tracking-tight">TxnPipe</h1>
        <div className="flex items-center gap-4">
          <Link href="/analytics" className="text-sm text-neutral-500 underline-offset-2 hover:underline">
            Analytics
          </Link>
          <Link href="/history" className="text-sm text-neutral-500 underline-offset-2 hover:underline">
            History
          </Link>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-5 gap-6">
        {stage === 'idle' && (
          <p className="text-center text-neutral-500 text-sm max-w-xs">
            Snap a receipt, credit card notification, or payslip — or pick a batch from your
            gallery. TxnPipe will extract them and log them to your spreadsheet.
          </p>
        )}

        {stage === 'selecting' && (
          <div className="w-full max-w-sm flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium">
                {selectedCount} of {candidates.length} selected
              </p>
              <button
                type="button"
                onClick={() => reset(candidates)}
                className="text-sm text-neutral-500"
              >
                Clear
              </button>
            </div>

            {duplicateCount > 0 && (
              <p className="text-xs text-amber-600">
                {duplicateCount} already logged — deselected, tap to include anyway.
              </p>
            )}

            <div className="grid grid-cols-3 gap-2">
              {candidates.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => toggle(c.key)}
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                    c.selected ? 'border-black' : 'border-neutral-200 opacity-40'
                  }`}
                  aria-pressed={c.selected}
                  aria-label={`${c.name}${c.duplicateAt ? ', already logged' : ''}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.previewUrl} alt="" className="w-full h-full object-cover" />
                  {c.duplicateAt !== undefined && (
                    <span className="absolute bottom-0 inset-x-0 bg-amber-500 text-[10px] text-white py-0.5">
                      Logged {formatDate(c.duplicateAt)}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void startExtraction(candidates)}
              disabled={selectedCount === 0}
              className="w-full py-3.5 rounded-2xl bg-black text-white font-semibold text-sm disabled:opacity-40"
            >
              Extract {selectedCount} receipt{selectedCount === 1 ? '' : 's'}
            </button>
          </div>
        )}

        {stage !== 'selecting' && <PhotoCapture onFiles={handleFiles} busy={busy} onError={(m) => setError(m || null)} />}

        {busy && (
          <p className="text-sm text-neutral-400 animate-pulse" role="status">
            {stage === 'preparing'
              ? `Reading ${progress.done}/${progress.total}…`
              : `Extracting ${progress.done}/${progress.total}…`}
          </p>
        )}

        {error && <p className="text-sm text-red-500 text-center max-w-xs">{error}</p>}
      </div>
    </main>
  )
}
