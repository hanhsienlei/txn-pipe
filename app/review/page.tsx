'use client'

import { useEffect, useState, startTransition } from 'react'
import { useRouter } from 'next/navigation'
import EntryForm from '@/components/EntryForm'
import type { Entry } from '@/types/transaction'

export default function ReviewPage() {
  const router = useRouter()
  const [entry, setEntry] = useState<Entry | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('txnpipe_entry')
    if (!raw) {
      router.replace('/')
      return
    }
    startTransition(() => {
      try {
        setEntry(JSON.parse(raw) as Entry)
      } catch {
        router.replace('/')
      }
    })
  }, [router])

  async function handleSubmit(approved: Entry) {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(approved),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        setError(data.error ?? 'Failed to save')
        return
      }

      // Persist to local history
      const history: Entry[] = JSON.parse(localStorage.getItem('txnpipe_history') ?? '[]')
      history.unshift(approved)
      localStorage.setItem('txnpipe_history', JSON.stringify(history.slice(0, 100)))

      sessionStorage.removeItem('txnpipe_entry')
      router.push('/')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!entry) {
    return (
      <main className="flex items-center justify-center min-h-dvh">
        <p className="text-neutral-400 text-sm">Loading...</p>
      </main>
    )
  }

  return (
    <main className="flex flex-col min-h-dvh">
      <header className="px-5 pt-12 pb-4">
        <h1 className="text-xl font-bold tracking-tight">Review</h1>
        <p className="text-sm text-neutral-500 mt-1">Check and edit before saving to your sheet.</p>
      </header>

      <div className="flex-1 px-5 pb-8">
        <EntryForm
          initial={entry}
          onSubmit={handleSubmit}
          onRetake={() => router.push('/')}
          submitting={submitting}
        />
        {error && <p className="mt-4 text-sm text-red-500 text-center">{error}</p>}
      </div>
    </main>
  )
}
