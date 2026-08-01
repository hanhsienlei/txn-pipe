'use client'

import { useEffect, useState, startTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppHeader from '@/components/AppHeader'
import { readSaveResult, clearSaveResult, type SaveResult } from '@/lib/save-result'
import { sheetUrl } from '@/lib/sheet-info'
import { describeEntry } from '@/lib/history'
import { formatAmount, formatClock } from '@/lib/format'

/** `rows 214–218`, `row 214`, or nothing at all if the API didn't report a range. */
function rowRange(write: SaveResult['writes'][number]): string {
  if (!write.rowStart) return ''
  if (!write.rowEnd || write.rowEnd === write.rowStart) return ` — row ${write.rowStart}`
  return ` — rows ${write.rowStart}–${write.rowEnd}`
}

export default function SavedPage() {
  const router = useRouter()
  const [result, setResult] = useState<SaveResult | null>(null)

  useEffect(() => {
    const saved = readSaveResult()
    if (!saved) {
      router.replace('/')
      return
    }
    // The draft is cleared here, at the end of the flow, not on the review page — a
    // back-navigation mid-check must never be what discards your work.
    sessionStorage.removeItem('txnpipe_review_step')
    clearSaveResult()
    startTransition(() => setResult(saved))
  }, [router])

  if (!result) {
    return (
      <main className="flex flex-col min-h-dvh">
        <AppHeader state="Saved" />
      </main>
    )
  }

  const { entries, writes, sheetTitle, spreadsheetId } = result
  const currencies = [...new Set(entries.map((entry) => entry.currency))]
  const totals = currencies.map((currency) => ({
    currency,
    value: entries
      .filter((entry) => entry.currency === currency)
      .reduce((sum, entry) => sum + entry.amount, 0),
  }))

  const firstWrite = writes[0]
  const link = spreadsheetId
    ? sheetUrl(spreadsheetId, firstWrite?.gid, firstWrite?.rowStart)
    : null

  return (
    <main className="flex flex-col min-h-dvh">
      <AppHeader state={`Saved ${formatClock(result.savedAt)}`} destination={sheetTitle} />

      <div className="flex-1 px-5 pt-7 flex flex-col gap-[22px]">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <i className="ph-duotone ph-check-circle text-[34px] text-accent" aria-hidden />
            <h2 className="text-[38px] font-semibold leading-none tracking-[-0.02em]">Saved</h2>
          </div>
          <p className="text-[17px] leading-[1.45] text-ink-75 text-pretty">
            {entries.length} row{entries.length === 1 ? '' : 's'} written to{' '}
            <strong className="font-semibold">{sheetTitle}</strong>
            {writes.map((write, index) => (
              <span key={write.tab}>
                {index === 0 ? ', ' : ' and '}
                {write.tabName} tab{rowRange(write)}
              </span>
            ))}
            .
          </p>
        </div>

        <div className="flex flex-col">
          {entries.map((entry, index) => (
            <div
              key={index}
              className="flex items-baseline justify-between gap-3 py-2.5 border-b border-ink-12"
            >
              <span className="text-[17px] truncate">{describeEntry(entry)}</span>
              <span className="text-[17px] tabular-nums shrink-0">
                {formatAmount(entry.amount)}
              </span>
            </div>
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
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            <i className="ph-duotone ph-table text-xl" aria-hidden />
            Open the sheet
          </a>
        )}
        <div className="flex gap-2.5">
          <Link href="/" className="btn btn-outline flex-1">
            Snap another
          </Link>
          <Link href="/history" className="btn btn-outline flex-1">
            History
          </Link>
        </div>
      </div>
    </main>
  )
}
