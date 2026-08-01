'use client'

import { useEffect, useMemo, useState, startTransition } from 'react'
import AppHeader from '@/components/AppHeader'
import { useSheetInfo } from '@/lib/sheet-info'
import { readHistory, describeEntry, categoryOf, accountOf } from '@/lib/history'
import { formatAmount, formatSigned, formatDayHeader, formatDayMonth } from '@/lib/format'
import type { Entry } from '@/types/transaction'

interface Day {
  date: string
  entries: Entry[]
  net: number
}

/** Newest day first, entries kept in the order they were written. */
function groupByDay(entries: Entry[]): Day[] {
  const days = new Map<string, Entry[]>()
  for (const entry of entries) {
    const existing = days.get(entry.date)
    if (existing) existing.push(entry)
    else days.set(entry.date, [entry])
  }

  return [...days.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, dayEntries]) => ({
      date,
      entries: dayEntries,
      net: dayEntries.reduce(
        (sum, entry) => sum + (entry.type === 'income' ? entry.amount : -entry.amount),
        0,
      ),
    }))
}

function matches(entry: Entry, query: string): boolean {
  const haystack = [
    describeEntry(entry),
    categoryOf(entry),
    accountOf(entry),
    entry.amount.toFixed(2),
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

export default function HistoryPage() {
  const info = useSheetInfo()
  const [history, setHistory] = useState<Entry[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    const entries = readHistory()
    startTransition(() => setHistory(entries))
  }, [])

  const days = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = needle ? history.filter((entry) => matches(entry, needle)) : history
    return groupByDay(filtered)
  }, [history, query])

  return (
    <main className="flex flex-col min-h-dvh">
      <AppHeader state={`Last ${history.length} rows`} destination={info?.title} active="history">
        <div className="flex items-center gap-2 mt-3.5 px-2.5 min-h-11 rounded-sharp border border-ink-25">
          <i className="ph-duotone ph-magnifying-glass text-[18px] text-ink-50" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search merchant or amount"
            aria-label="Search history"
            className="field-input text-base"
          />
        </div>
      </AppHeader>

      <div className="flex-1 px-5 pt-[18px] pb-10">
        {history.length === 0 ? (
          <p className="eyebrow mt-16 text-center">Nothing logged yet</p>
        ) : days.length === 0 ? (
          <p className="eyebrow mt-16 text-center">No rows match “{query}”</p>
        ) : (
          days.map((day, index) => (
            <section key={day.date}>
              <div
                className={`flex items-baseline justify-between gap-3 pb-1.5 ${
                  index > 0 ? 'pt-[22px]' : ''
                }`}
              >
                <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em]">
                  {formatDayHeader(day.date)}
                </h2>
                <span className="text-[13px] uppercase tracking-[0.06em] text-ink-55 tabular-nums">
                  {formatSigned(day.net)}
                </span>
              </div>

              <ul className="flex flex-col">
                {day.entries.map((entry, i) => (
                  <li
                    key={i}
                    className="flex items-baseline justify-between gap-3 py-[11px] border-t border-ink-12"
                  >
                    <span className="flex flex-col gap-px min-w-0">
                      <span className="text-[18px] truncate">{describeEntry(entry)}</span>
                      <span className="text-sm text-ink-55 truncate">
                        {formatDayMonth(entry.date)} · {categoryOf(entry)} · {accountOf(entry)}
                      </span>
                    </span>
                    <span
                      className={`text-[19px] tabular-nums shrink-0 ${
                        entry.type === 'income' ? 'text-accent' : ''
                      }`}
                    >
                      {entry.type === 'income' ? '+' : '−'}
                      {formatAmount(entry.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </main>
  )
}
