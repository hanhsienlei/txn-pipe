'use client'

import { useEffect, useState, startTransition } from 'react'
import Link from 'next/link'
import type { Entry } from '@/types/transaction'

function entryLabel(entry: Entry): string {
  return entry.type === 'income' ? entry.income : entry.expense
}

function entryCategory(entry: Entry): string {
  return entry.type === 'income' ? entry.source : entry.category
}

function formatAmount(entry: Entry): string {
  return `${entry.type === 'expense' ? '-' : '+'}${entry.amount.toFixed(2)} ${entry.currency}`
}

export default function HistoryPage() {
  const [history, setHistory] = useState<Entry[]>([])

  useEffect(() => {
    const raw = localStorage.getItem('txnpipe_history')
    startTransition(() => {
      if (raw) {
        try {
          setHistory(JSON.parse(raw) as Entry[])
        } catch {
          setHistory([])
        }
      }
    })
  }, [])

  return (
    <main className="flex flex-col min-h-dvh">
      <header className="flex items-center justify-between px-5 pt-12 pb-4">
        <h1 className="text-xl font-bold tracking-tight">History</h1>
        <Link href="/" className="text-sm text-neutral-500 underline-offset-2 hover:underline">
          ← Home
        </Link>
      </header>

      <div className="flex-1 px-5 pb-8">
        {history.length === 0 ? (
          <p className="text-center text-neutral-400 text-sm mt-16">No entries yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {history.map((entry, i) => (
              <li key={i} className="flex items-center justify-between py-3 border-b border-neutral-100">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{entryLabel(entry)}</span>
                  <span className="text-xs text-neutral-400">
                    {entryCategory(entry)} · {entry.date}
                  </span>
                </div>
                <span
                  className={`text-sm font-semibold tabular-nums ${
                    entry.type === 'income' ? 'text-green-600' : 'text-neutral-900'
                  }`}
                >
                  {formatAmount(entry)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
