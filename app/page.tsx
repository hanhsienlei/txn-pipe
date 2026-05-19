'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import PhotoCapture from '@/components/PhotoCapture'
import DebugLog, { dbg } from '@/components/DebugLog'
import type { Entry } from '@/types/transaction'
import Link from 'next/link'

export default function HomePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCapture(base64: string, mimeType: string) {
    dbg('handleCapture, mime:', mimeType)
    setLoading(true)
    setError(null)
    try {
      dbg('fetching /api/extract...')
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mimeType }),
      })
      dbg('response status:', res.status)
      const data = (await res.json()) as { entries: Entry[] } | { error: string }
      if (!res.ok) {
        dbg('ERR extract:', (data as { error: string }).error)
        setError((data as { error: string }).error ?? 'Extraction failed')
        return
      }
      const { entries } = data as { entries: Entry[] }
      dbg('success, entries:', entries.length)
      sessionStorage.setItem('txnpipe_entries', JSON.stringify(entries))
      router.push('/review')
    } catch (err) {
      dbg('ERR fetch:', String(err))
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex flex-col min-h-dvh">
      <header className="flex items-center justify-between px-5 pt-12 pb-4">
        <h1 className="text-xl font-bold tracking-tight">TxnPipe</h1>
        <Link href="/history" className="text-sm text-neutral-500 underline-offset-2 hover:underline">
          History
        </Link>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-5 gap-6 pb-52">
        <p className="text-center text-neutral-500 text-sm max-w-xs">
          Snap a receipt, credit card notification, or payslip — TxnPipe will extract and log it to
          your spreadsheet.
        </p>

        <PhotoCapture onCapture={handleCapture} loading={loading} onError={setError} />

        {error && <p className="text-sm text-red-500 text-center max-w-xs">{error}</p>}
      </div>
      <DebugLog />
    </main>
  )
}
