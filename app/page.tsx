'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, startTransition } from 'react'
import AppHeader from '@/components/AppHeader'
import PhotoCapture from '@/components/PhotoCapture'
import PhotoSheet from '@/components/PhotoSheet'
import ExtractionProgress, { type TileState } from '@/components/ExtractionProgress'
import { dbg } from '@/components/DebugLog'
import { prepareImage, blobToBase64, type PreparedImage } from '@/lib/image'
import { runBatch, toQueueItems } from '@/lib/extract-batch'
import { useSheetInfo } from '@/lib/sheet-info'
import { readHistory, describeEntry } from '@/lib/history'
import { formatAmount, formatDayMonth } from '@/lib/format'
import {
  ACTIVE_BATCH_KEY,
  findProcessed,
  saveImages,
  saveBatch,
  saveQueue,
  pruneStaleBatches,
} from '@/lib/batch-store'
import type { BatchImage } from '@/types/batch'
import type { Entry } from '@/types/transaction'

interface Candidate {
  key: string
  name: string
  prepared: PreparedImage
  previewUrl: string
  duplicateAt?: number
  selected: boolean
}

type Stage = 'idle' | 'preparing' | 'selecting' | 'extracting'

export default function HomePage() {
  const router = useRouter()
  const info = useSheetInfo()
  const [stage, setStage] = useState<Stage>('idle')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [tileStates, setTileStates] = useState<Record<string, TileState>>({})
  const [startedAt, setStartedAt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [lastLogged, setLastLogged] = useState<Entry | null>(null)

  useEffect(() => {
    const latest = readHistory()[0] ?? null
    startTransition(() => setLastLogged(latest))
  }, [])

  function reset(list: Candidate[]) {
    for (const c of list) URL.revokeObjectURL(c.previewUrl)
    setCandidates([])
    setStage('idle')
    setProgress({ done: 0, total: 0 })
    setTileStates({})
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
    setCandidates((prev) => prev.map((c) => (c.key === key ? { ...c, selected: !c.selected } : c)))
  }

  function selectAll() {
    const allSelected = candidates.every((c) => c.selected)
    setCandidates((prev) => prev.map((c) => ({ ...c, selected: !allSelected })))
  }

  async function startExtraction(list: Candidate[]) {
    const chosen = list.filter((c) => c.selected)
    if (!chosen.length) return

    setStage('extracting')
    setProgress({ done: 0, total: chosen.length })
    setTileStates(Object.fromEntries(chosen.map((c) => [c.key, 'queued' as TileState])))
    setStartedAt(Date.now())
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
    // Extraction reports progress by image id; the tiles are keyed by candidate.
    const keyById = new Map(images.map((image, i) => [image.id, chosen[i].key]))

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
        onImageStart: (id) => markTile(keyById, id, 'reading'),
        onImageSettled: (outcome) => markTile(keyById, outcome.id, outcome.ok ? 'done' : 'failed'),
      })

      await saveQueue(batchId, toQueueItems(outcomes))
      sessionStorage.setItem(ACTIVE_BATCH_KEY, batchId)
      sessionStorage.removeItem('txnpipe_review_step')
      for (const c of list) URL.revokeObjectURL(c.previewUrl)
      router.push('/review')
    } catch (err) {
      dbg('ERR batch:', String(err))
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setStage('selecting')
    }
  }

  function markTile(keyById: Map<string, string>, id: string, state: TileState) {
    const key = keyById.get(id)
    if (key) setTileStates((prev) => ({ ...prev, [key]: state }))
  }

  const sheetName = info?.title
  const busy = stage === 'preparing' || stage === 'extracting'
  const selectedCandidates = candidates.filter((c) => c.selected)

  // Only claim a time once something has actually finished — an estimate from no
  // samples is a guess dressed up as information.
  const secondsLeft = (() => {
    if (stage !== 'extracting' || progress.done === 0 || progress.done >= progress.total) return
    const perImage = (Date.now() - startedAt) / progress.done
    return Math.max(1, Math.round((perImage * (progress.total - progress.done)) / 1000))
  })()

  if (busy) {
    const tiles = (stage === 'extracting' ? selectedCandidates : candidates).map((c) => ({
      key: c.key,
      previewUrl: c.previewUrl,
      state: stage === 'extracting' ? (tileStates[c.key] ?? 'queued') : ('done' as TileState),
    }))

    return (
      <main className="flex flex-col min-h-dvh">
        <AppHeader
          state={stage === 'extracting' ? 'Extracting' : 'Opening photos'}
          destination="Don't close the app"
          inert
        />
        <ExtractionProgress
          headline={stage === 'extracting' ? 'Reading receipts' : 'Opening photos'}
          done={progress.done}
          total={progress.total}
          tiles={tiles}
          secondsLeft={secondsLeft}
        />
      </main>
    )
  }

  return (
    <main className="flex flex-col min-h-dvh">
      <div className={stage === 'selecting' ? 'opacity-35 pointer-events-none' : undefined}>
        <AppHeader
          state="Capture"
          destination={sheetName ? `${sheetName} · connected` : undefined}
        />
      </div>

      <div
        className={`flex-1 flex flex-col justify-center gap-[30px] px-5 pb-[60px] ${
          stage === 'selecting' ? 'opacity-35 pointer-events-none' : ''
        }`}
      >
        <div className="flex flex-col gap-2.5">
          <h2 className="text-[34px] font-semibold leading-[1.1] tracking-[-0.015em]">
            Snap it,
            <br />
            it&rsquo;s filed.
          </h2>
          <p className="text-base leading-[1.5] text-ink-70 max-w-[300px] text-pretty">
            A receipt, a card notification, a payslip — or a whole batch from your camera roll.
          </p>
        </div>

        <PhotoCapture onFiles={handleFiles} busy={busy} onError={(m) => setError(m || null)} />

        {error && <p className="text-[15px] text-accent-2">{error}</p>}

        {lastLogged && (
          <div className="flex items-baseline justify-between gap-3 pt-1">
            <span className="eyebrow">Last logged</span>
            <span className="text-[15px] text-right">
              {describeEntry(lastLogged)} · {formatAmount(lastLogged.amount)}{' '}
              {lastLogged.currency} · {formatDayMonth(lastLogged.date)}
            </span>
          </div>
        )}
      </div>

      {stage === 'selecting' && (
        <PhotoSheet
          photos={candidates}
          onToggle={toggle}
          onSelectAll={selectAll}
          onCancel={() => reset(candidates)}
          onExtract={() => void startExtraction(candidates)}
        />
      )}
    </main>
  )
}
