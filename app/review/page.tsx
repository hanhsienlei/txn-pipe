'use client'

import { useEffect, useState, startTransition } from 'react'
import { useRouter } from 'next/navigation'
import EntryForm from '@/components/EntryForm'
import type { Entry } from '@/types/transaction'

export default function ReviewPage() {
  const router = useRouter()
  const [entries, setEntries] = useState<Entry[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)

  useEffect(() => {
    const raw = sessionStorage.getItem('txnpipe_entries')
    if (!raw) { router.replace('/'); return }
    startTransition(() => {
      try {
        const parsed = JSON.parse(raw) as Entry[]
        if (!parsed.length) { router.replace('/'); return }
        setEntries(parsed)
      } catch {
        router.replace('/')
      }
    })
  }, [router])

  function handleEdit(edited: Entry) {
    setEntries((prev) => prev.map((e, i) => (i === currentIdx ? edited : e)))
  }

  function handleDelete() {
    if (entries.length === 1) { router.push('/'); return }
    const updated = entries.filter((_, i) => i !== currentIdx)
    setEntries(updated)
    setCurrentIdx((i) => Math.min(i, updated.length - 1))
    setFormKey((k) => k + 1)
    setError(null)
  }

  async function handleNext(edited: Entry) {
    const updated = entries.map((e, i) => (i === currentIdx ? edited : e))
    setEntries(updated)

    if (currentIdx < entries.length - 1) {
      setCurrentIdx((i) => i + 1)
      setError(null)
      return
    }

    // Last entry — submit all
    setSubmitting(true)
    setError(null)
    try {
      for (let i = 0; i < updated.length; i++) {
        const res = await fetch('/api/sheets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated[i]),
        })
        if (!res.ok) {
          const d = (await res.json()) as { error?: string }
          setError(`Entry ${i + 1} of ${updated.length} failed: ${d.error ?? 'Unknown error'}`)
          return
        }
      }

      // Save all to local history
      const history: Entry[] = JSON.parse(localStorage.getItem('txnpipe_history') ?? '[]')
      history.unshift(...updated)
      localStorage.setItem('txnpipe_history', JSON.stringify(history.slice(0, 100)))

      sessionStorage.removeItem('txnpipe_entries')
      router.push('/')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!entries.length) {
    return (
      <main className="flex items-center justify-center min-h-dvh">
        <p className="text-neutral-400 text-sm">Loading...</p>
      </main>
    )
  }

  const isLast = currentIdx === entries.length - 1
  const count = entries.length

  return (
    <main className="flex flex-col min-h-dvh">
      <header className="px-5 pt-12 pb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Review</h1>
          <div className="flex items-center gap-3">
            {count > 1 && (
              <span className="text-sm font-medium text-neutral-500">
                {currentIdx + 1} / {count}
              </span>
            )}
            <button
              type="button"
              onClick={handleDelete}
              className="text-sm text-red-500 font-medium"
            >
              Delete
            </button>
          </div>
        </div>
        <p className="text-sm text-neutral-500 mt-1">
          {count > 1
            ? `Entry ${currentIdx + 1} of ${count} — check and edit before saving.`
            : 'Check and edit before saving to your sheet.'}
        </p>
        {count > 1 && (
          <div className="flex gap-1 mt-3">
            {entries.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i < currentIdx ? 'bg-black' : i === currentIdx ? 'bg-black/50' : 'bg-neutral-200'
                }`}
              />
            ))}
          </div>
        )}
      </header>

      <div className="flex-1 px-5 pb-8">
        <EntryForm
          key={`${currentIdx}-${formKey}`}
          initial={entries[currentIdx]}
          onSubmit={handleNext}
          onChange={handleEdit}
          onRetake={() => {
            if (currentIdx > 0) {
              setCurrentIdx((i) => i - 1)
              setError(null)
            } else {
              router.push('/')
            }
          }}
          submitting={submitting}
          submitLabel={
            isLast
              ? (count > 1 ? `Save All (${count})` : 'Approve & Save')
              : 'Next →'
          }
          retakeLabel={currentIdx > 0 ? '← Back' : 'Retake'}
        />
        {error && <p className="mt-4 text-sm text-red-500 text-center">{error}</p>}
      </div>
    </main>
  )
}
