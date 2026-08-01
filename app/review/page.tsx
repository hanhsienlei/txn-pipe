'use client'

import { useEffect, useState, startTransition } from 'react'
import { useRouter } from 'next/navigation'
import AppHeader, { StepRail } from '@/components/AppHeader'
import EntryForm from '@/components/EntryForm'
import CategorySelect from '@/components/CategorySelect'
import { blobToBase64 } from '@/lib/image'
import { runBatch, toQueueItems, replaceImageItems } from '@/lib/extract-batch'
import { deriveConfidence, type ConfidenceField, type FieldConfidence } from '@/lib/confidence'
import { formatAmount, formatDayMonth } from '@/lib/format'
import { useSheetInfo } from '@/lib/sheet-info'
import { buildSaveResult, writeSaveResult } from '@/lib/save-result'
import {
  readHistory,
  prependHistory,
  describeEntry,
  categoryOf,
  accountOf,
  categoryHint,
} from '@/lib/history'
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

const STEP_KEY = 'txnpipe_review_step'

function isEntryItem(item: QueueItem): item is EntryItem {
  return item.kind === 'entry'
}

function tabOf(entry: Entry): TabName {
  return entry.type === 'income' ? 'income' : 'expense'
}

/** Which tabs this batch will write to — stated in the dateline before you commit. */
function tabsLabel(entries: Entry[]): string {
  const tabs = [...new Set(entries.map(tabOf))]
  return tabs.join(' + ')
}

export default function ReviewPage() {
  const router = useRouter()
  const info = useSheetInfo()
  const [batchId, setBatchId] = useState<string | null>(null)
  const [items, setItems] = useState<QueueItem[]>([])
  const [images, setImages] = useState<Record<string, BatchImage>>({})
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [confidence, setConfidence] = useState<Record<string, FieldConfidence>>({})
  const [history, setHistory] = useState<Entry[]>([])
  const [step, setStep] = useState(0)
  const [onSummary, setOnSummary] = useState(false)
  const [editingCategory, setEditingCategory] = useState(false)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [lightbox, setLightbox] = useState<string | null>(null)
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

      // Flagged fields are derived once, on arrival, then only ever cleared — so a field
      // you have already checked doesn't light up again when you navigate back to it.
      const flags: Record<string, FieldConfidence> = {}
      for (const item of batch.items) {
        if (item.kind === 'entry') flags[item.id] = deriveConfidence(item.entry)
      }

      // A mid-check reload resumes where you were rather than at entry one.
      const saved = Number(sessionStorage.getItem(STEP_KEY) ?? '0')
      const resume = Number.isInteger(saved) ? Math.min(Math.max(saved, 0), batch.items.length - 1) : 0

      startTransition(() => {
        setBatchId(id)
        setItems(batch.items)
        setImages(imageMap)
        setUrls(urlMap)
        setConfidence(flags)
        setHistory(readHistory())
        setStep(resume)
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

  function goToStep(index: number, dir: 'forward' | 'back' = 'forward') {
    setDirection(dir)
    setEditingCategory(false)
    setOnSummary(false)
    setStep(index)
    sessionStorage.setItem(STEP_KEY, String(index))
  }

  function goToSummary(dir: 'forward' | 'back' = 'forward') {
    setDirection(dir)
    setEditingCategory(false)
    setOnSummary(true)
  }

  function handleEdit(itemId: string, entry: Entry) {
    persist(items.map((item) => (item.id === itemId && item.kind === 'entry' ? { ...item, entry } : item)))
  }

  function markChecked(itemId: string, field: ConfidenceField) {
    setConfidence((prev) => {
      if (!prev[itemId]?.[field]) return prev
      const next = { ...prev[itemId] }
      delete next[field]
      return { ...prev, [itemId]: next }
    })
  }

  function advance() {
    if (step >= items.length - 1) goToSummary()
    else goToStep(step + 1)
  }

  /** Drop this entry, shorten the rail, and land on whatever now occupies this slot. */
  function drop(item: QueueItem) {
    const next =
      item.kind === 'entry'
        ? items.filter((other) => other.id !== item.id)
        : items.filter((other) => other.imageId !== item.imageId)

    if (!next.length) {
      if (batchId) void deleteBatch(batchId)
      sessionStorage.removeItem(ACTIVE_BATCH_KEY)
      sessionStorage.removeItem(STEP_KEY)
      router.push('/')
      return
    }

    persist(next)
    if (step >= next.length) goToSummary()
    else goToStep(step)
  }

  async function handleRetry(imageId: string) {
    const image = images[imageId]
    if (!image) return
    setRetrying(imageId)
    setError(null)
    try {
      const base64 = await blobToBase64(image.blob)
      const outcomes = await runBatch([{ id: imageId, base64, mimeType: image.mimeType }])
      const replacement = toQueueItems(outcomes)
      setConfidence((prev) => {
        const next = { ...prev }
        for (const item of replacement) {
          if (item.kind === 'entry') next[item.id] = deriveConfidence(item.entry)
        }
        return next
      })
      persist(replaceImageItems(items, imageId, replacement))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed')
    } finally {
      setRetrying(null)
    }
  }

  function recordSaved(saved: QueueItem[]) {
    prependHistory(saved.flatMap((item) => (item.kind === 'entry' ? [item.entry] : [])))

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

      const entries = entryItems.map((item) => item.entry)
      // Captured before the batch goes away — the saved screen has no other source for
      // which rows were written.
      writeSaveResult(buildSaveResult(entries, data.outcomes ?? [], info))
      recordSaved(entryItems)
      if (batchId) await deleteBatch(batchId)
      sessionStorage.removeItem(ACTIVE_BATCH_KEY)
      router.push('/saved')
    } catch {
      setError('Network error. Please try again.')
      setStatus('ready')
    }
  }

  if (status === 'loading') {
    return (
      <main className="flex flex-col min-h-dvh">
        <AppHeader state="Check" destination={info?.title} />
        <div className="flex-1 flex items-center justify-center px-5">
          <p className="eyebrow">Loading</p>
        </div>
      </main>
    )
  }

  const sheetName = info?.title
  const entries = items.filter(isEntryItem).map((item) => item.entry)
  const animation = direction === 'forward' ? 'step-forward' : 'step-back'

  if (onSummary) {
    return (
      <SummaryScreen
        entries={entries}
        sheetName={sheetName}
        saving={status === 'saving'}
        error={error}
        animation={animation}
        onSave={() => void handleSave()}
        onBack={() => goToStep(items.length - 1, 'back')}
        onPick={(index) => {
          const targetId = items.filter(isEntryItem)[index]?.id
          const target = items.findIndex((item) => item.id === targetId)
          goToStep(target === -1 ? 0 : target, 'back')
        }}
      />
    )
  }

  const item = items[step]
  const url = urls[item.imageId]

  return (
    <main className="flex flex-col min-h-dvh">
      <AppHeader state={`Check · ${step + 1} of ${items.length}`} destination={sheetName}>
        <StepRail total={items.length} current={step} />
      </AppHeader>

      {item.kind === 'entry' ? (
        editingCategory ? (
          <CategoryStep
            key={`cat-${item.id}`}
            entry={item.entry}
            history={history}
            animation={animation}
            onPick={(value) => {
              handleEdit(
                item.id,
                item.entry.type === 'income'
                  ? { ...item.entry, source: value }
                  : { ...item.entry, category: value },
              )
              markChecked(item.id, 'category')
            }}
            onDone={() => goToStep(step)}
          />
        ) : (
          <>
            <div key={`step-${item.id}`} className={`flex-1 px-5 pt-5 ${animation}`}>
              <EntryForm
                entry={item.entry}
                confidence={confidence[item.id] ?? {}}
                imageUrl={url}
                onChange={(entry) => handleEdit(item.id, entry)}
                onChecked={(field) => markChecked(item.id, field)}
                onEditCategory={() => {
                  setDirection('forward')
                  setEditingCategory(true)
                }}
                onViewImage={() => url && setLightbox(url)}
              />
            </div>

            <div className="px-5 pt-3.5 pb-[46px] flex flex-col gap-2.5 bg-bg">
              <button type="button" onClick={advance} className="btn btn-primary">
                Looks right — next
              </button>
              <div className="flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={() => goToStep(step - 1, 'back')}
                  disabled={step === 0}
                  className="text-[15px] text-ink-65 disabled:opacity-30"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={() => drop(item)}
                  className="text-[15px] text-ink-65"
                >
                  Not a receipt
                </button>
                <button
                  type="button"
                  onClick={() => goToSummary()}
                  className="text-[15px] text-accent"
                >
                  Skip to summary
                </button>
              </div>
            </div>
          </>
        )
      ) : (
        <UnreadableStep
          key={`bad-${item.id}`}
          kind={item.kind}
          message={item.kind === 'failed' ? item.error : undefined}
          imageUrl={url}
          busy={retrying === item.imageId}
          animation={animation}
          onRetry={() => void handleRetry(item.imageId)}
          onDismiss={() => drop(item)}
          onBack={step === 0 ? undefined : () => goToStep(step - 1, 'back')}
          onSkip={() => goToSummary()}
        />
      )}

      {lightbox && (
        <button
          type="button"
          aria-label="Close image"
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 bg-[rgba(32,30,29,0.9)] flex items-center justify-center p-5"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Receipt" className="max-w-full max-h-full object-contain" />
        </button>
      )}
    </main>
  )
}

/** Screen 5 — the category chips, given a step of their own. */
function CategoryStep({
  entry,
  history,
  animation,
  onPick,
  onDone,
}: {
  entry: Entry
  history: Entry[]
  animation: string
  onPick: (value: string) => void
  onDone: () => void
}) {
  const current = categoryOf(entry)
  const hint = categoryHint(describeEntry(entry), entry.type, history)

  return (
    <>
      <div className={`flex-1 px-5 pt-6 flex flex-col gap-[22px] ${animation}`}>
        <div className="flex flex-col gap-1">
          <h2 className="text-[28px] font-semibold tracking-[-0.015em]">
            {entry.type === 'income' ? 'Which source?' : 'Which category?'}
          </h2>
          <p className="text-base text-ink-70">
            {describeEntry(entry)} · {formatAmount(entry.amount)} {entry.currency}
          </p>
        </div>

        {hint && hint.category !== current && (
          <p className="flex items-center gap-2 text-[15px] text-ink-70">
            <i className="ph-duotone ph-clock-counter-clockwise text-[18px] text-accent" aria-hidden />
            Your last {hint.count} {hint.label} entries went to{' '}
            <span className="text-accent-600">{hint.category}</span>
          </p>
        )}

        <CategorySelect type={entry.type} value={current} onChange={onPick} />
      </div>

      <div className="px-5 pt-3.5 pb-[46px]">
        <button type="button" onClick={onDone} className="btn btn-primary">
          Set {current} — next
        </button>
      </div>
    </>
  )
}

/**
 * An image that produced nothing usable. Not in the prototype, but every image reaches
 * the queue by design, so each one needs a step and a decision of its own.
 */
function UnreadableStep({
  kind,
  message,
  imageUrl,
  busy,
  animation,
  onRetry,
  onDismiss,
  onBack,
  onSkip,
}: {
  kind: 'empty' | 'failed'
  message?: string
  imageUrl?: string
  busy: boolean
  animation: string
  onRetry: () => void
  onDismiss: () => void
  onBack?: () => void
  onSkip: () => void
}) {
  return (
    <>
      <div className={`flex-1 px-5 pt-5 flex flex-col gap-5 ${animation}`}>
        {imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={imageUrl}
            alt=""
            className="w-[72px] h-[72px] object-cover rounded-sharp bg-surface"
          />
        )}
        <div className="flex flex-col gap-2">
          <h2 className="text-[28px] font-semibold tracking-[-0.015em]">
            {kind === 'failed' ? 'Couldn’t read this one' : 'No transactions here'}
          </h2>
          <p className="text-base leading-[1.45] text-ink-70 max-w-[320px] text-pretty">
            {kind === 'failed'
              ? (message ?? 'Extraction failed.')
              : 'Nothing on this image looks like a transaction — a blurry receipt, or not a receipt at all.'}
          </p>
        </div>
      </div>

      <div className="px-5 pt-3.5 pb-[46px] flex flex-col gap-2.5">
        <button type="button" onClick={onRetry} disabled={busy} className="btn btn-primary">
          {busy ? 'Reading…' : 'Try reading it again'}
        </button>
        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            onClick={onBack}
            disabled={!onBack}
            className="text-[15px] text-ink-65 disabled:opacity-30"
          >
            ← Back
          </button>
          <button type="button" onClick={onDismiss} className="text-[15px] text-ink-65">
            Not a receipt
          </button>
          <button type="button" onClick={onSkip} className="text-[15px] text-accent">
            Skip to summary
          </button>
        </div>
      </div>
    </>
  )
}

/** Screen 6 — one last read of everything, with a total, before anything is written. */
function SummaryScreen({
  entries,
  sheetName,
  saving,
  error,
  animation,
  onSave,
  onBack,
  onPick,
}: {
  entries: Entry[]
  sheetName?: string
  saving: boolean
  error: string | null
  animation: string
  onSave: () => void
  onBack: () => void
  onPick: (index: number) => void
}) {
  const currencies = [...new Set(entries.map((entry) => entry.currency))]
  const mixed = new Set(entries.map((entry) => entry.type)).size > 1

  // Amounts stay exactly as extracted — no conversion, ever. A batch spanning two
  // currencies gets one total per currency rather than one meaningless number.
  const totals = currencies.map((currency) => ({
    currency,
    value: entries
      .filter((entry) => entry.currency === currency)
      .reduce((sum, entry) => sum + (mixed && entry.type === 'expense' ? -entry.amount : entry.amount), 0),
  }))

  const destination = sheetName ? `${sheetName} · ${tabsLabel(entries)}` : undefined

  return (
    <main className="flex flex-col min-h-dvh">
      <AppHeader state="Ready to save" destination={destination} />

      <div className={`flex-1 px-5 pt-5 flex flex-col gap-4 ${animation}`}>
        <h2 className="text-[30px] font-semibold tracking-[-0.015em]">
          {entries.length} checked
        </h2>

        <div className="flex flex-col">
          {entries.map((entry, index) => (
            <button
              key={index}
              type="button"
              onClick={() => onPick(index)}
              className="flex items-baseline justify-between gap-3 py-3 border-b border-ink-12 text-left"
            >
              <span className="flex flex-col gap-px min-w-0">
                <span className="text-[18px] truncate">{describeEntry(entry)}</span>
                <span className="text-sm text-ink-55 truncate">
                  {formatDayMonth(entry.date)} · {categoryOf(entry)} · {accountOf(entry)}
                </span>
              </span>
              <span className="text-[18px] tabular-nums shrink-0">
                {formatAmount(entry.amount)}
              </span>
            </button>
          ))}

          <div className="flex items-baseline justify-between gap-3 pt-3.5">
            <span className="eyebrow">Total</span>
            <span className="flex flex-col items-end gap-1">
              {totals.map((total) => (
                <span key={total.currency} className="text-2xl font-semibold tabular-nums">
                  {formatAmount(total.value)} {total.currency}
                </span>
              ))}
            </span>
          </div>
        </div>
      </div>

      <div className="px-5 pt-3.5 pb-[46px] flex flex-col gap-2.5">
        {error && <p className="text-[15px] text-accent-2 text-center">{error}</p>}
        <button type="button" onClick={onSave} disabled={saving} className="btn btn-primary">
          {saving
            ? 'Saving…'
            : `Save ${entries.length} row${entries.length === 1 ? '' : 's'} to sheet`}
        </button>
        <button type="button" onClick={onBack} className="btn min-h-11 text-base font-normal text-ink-65">
          Check them again
        </button>
      </div>
    </main>
  )
}
