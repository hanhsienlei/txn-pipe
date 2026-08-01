'use client'

import { useEffect, useState } from 'react'
import AppHeader from '@/components/AppHeader'
import { useSheetInfo } from '@/lib/sheet-info'
import { formatAmount, formatWhole } from '@/lib/format'
import type { AnalyticsData } from '@/lib/sheets'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function monthTotal(item: AnalyticsData['trend'][number]): number {
  return Object.entries(item)
    .filter(([key]) => key !== 'month')
    .reduce((sum, [, value]) => sum + Number(value), 0)
}

/** `2026-07` → `JUL`, for the six-month rail. */
function shortMonth(key: string): string {
  const month = Number(key.split('-')[1])
  return (MONTH_NAMES[month - 1] ?? '').slice(0, 3).toUpperCase()
}

export default function AnalyticsPage() {
  const info = useSheetInfo()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  // The fetch result is stored together with the request key it answers. Loading and
  // error are DERIVED from whether the stored result matches the current key — no
  // synchronous setState in the effect, and a late response from a previous month
  // can never overwrite the current one (the cancelled flag drops it).
  const [result, setResult] = useState<{
    key: string
    data: AnalyticsData | null
    error: string | null
  } | null>(null)

  const requestKey = `${year}-${month}`

  useEffect(() => {
    const key = `${year}-${month}`
    let cancelled = false
    fetch(`/api/analytics?year=${year}&month=${month}`)
      .then((res) => res.json())
      .then((d: AnalyticsData | { error: string }) => {
        if (cancelled) return
        if ('error' in d) setResult({ key, data: null, error: d.error })
        else setResult({ key, data: d, error: null })
      })
      .catch(() => {
        if (!cancelled) setResult({ key, data: null, error: 'Failed to load analytics' })
      })
    return () => {
      cancelled = true
    }
  }, [year, month])

  const current = result && result.key === requestKey ? result : null
  const loading = current === null
  const data = current?.data ?? null
  const error = current?.error ?? null

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  function prevMonth() {
    if (month === 1) {
      setMonth(12)
      setYear((y) => y - 1)
    } else {
      setMonth((m) => m - 1)
    }
  }

  function nextMonth() {
    if (isCurrentMonth) return
    if (month === 12) {
      setMonth(1)
      setYear((y) => y + 1)
    } else {
      setMonth((m) => m + 1)
    }
  }

  const breakdown = [...(data?.breakdown ?? [])].sort((a, b) => b.total - a.total)
  const spent = breakdown.reduce((sum, item) => sum + item.total, 0)
  const maxCategory = breakdown[0]?.total ?? 0

  const trend = data?.trend ?? []
  const trendTotals = trend.map(monthTotal)
  const maxTrend = Math.max(...trendTotals, 1)

  // "vs avg" compares against the preceding months only — including the month you are
  // looking at would flatten the very difference the figure is meant to show.
  const priorTotals = trendTotals.slice(0, -1).filter((total) => total > 0)
  const priorAvg = priorTotals.length
    ? priorTotals.reduce((sum, total) => sum + total, 0) / priorTotals.length
    : 0
  const vsAvg = priorAvg > 0 ? Math.round(((spent - priorAvg) / priorAvg) * 100) : null

  const budget = (() => {
    if (!data) return []
    const avgMap = new Map<string, number>()
    for (const item of data.trend.slice(-4, -1)) {
      for (const [key, value] of Object.entries(item)) {
        if (key === 'month') continue
        avgMap.set(key, (avgMap.get(key) ?? 0) + Number(value))
      }
    }
    return [...avgMap.entries()]
      .map(([category, sum]) => {
        const avg = Math.round((sum / 3) * 100) / 100
        const used = breakdown.find((item) => item.category === category)?.total ?? 0
        const remaining = Math.round((avg - used) * 100) / 100
        return { category, avg, used, remaining, pct: Math.min(1, used / avg), over: remaining < 0 }
      })
      .filter((item) => item.avg > 0)
      .sort((a, b) => b.pct - a.pct)
  })()

  return (
    <main className="flex flex-col min-h-dvh">
      <AppHeader state="Analytics" destination={info?.title} active="analytics">
        <div className="flex items-center justify-between pt-2.5">
          <button
            type="button"
            onClick={prevMonth}
            aria-label="Previous month"
            className="text-xl text-ink-50 px-2 -ml-2"
          >
            ‹
          </button>
          <span className="text-[13px] font-semibold uppercase tracking-[0.1em]">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            disabled={isCurrentMonth}
            aria-label="Next month"
            className="text-xl text-ink-50 px-2 -mr-2 disabled:text-ink-25"
          >
            ›
          </button>
        </div>
      </AppHeader>

      <div className="flex-1 px-5 pt-[22px] pb-10 flex flex-col gap-[26px]">
        {loading && <p className="eyebrow mt-16 text-center">Loading</p>}
        {error && <p className="text-[15px] text-accent-2 mt-16 text-center">{error}</p>}

        {data && !loading && (
          <>
            <div className="flex items-end justify-between gap-3 border-b border-ink-30 pb-2">
              <div className="flex flex-col gap-0.5">
                <span className="eyebrow">Spent this month</span>
                <span className="text-[38px] font-semibold leading-none tabular-nums">
                  {formatAmount(spent)}
                </span>
              </div>
              {vsAvg !== null && (
                <span className="text-[15px] text-ink-60 shrink-0">
                  {vsAvg > 0 ? '+' : vsAvg < 0 ? '−' : ''}
                  {Math.abs(vsAvg)}% vs avg
                </span>
              )}
            </div>

            <section className="flex flex-col gap-3.5">
              <span className="eyebrow">By category</span>
              {breakdown.length === 0 ? (
                <p className="text-[15px] text-ink-70">No expenses this month.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {breakdown.map((item) => (
                    <div key={item.category} className="flex flex-col gap-[5px]">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[17px] truncate">{item.category}</span>
                        <span className="text-[17px] tabular-nums shrink-0">
                          {formatAmount(item.total)}
                        </span>
                      </div>
                      <div className="h-2 bg-ink-10">
                        <div
                          className="h-full bg-accent"
                          style={{ width: `${maxCategory ? (item.total / maxCategory) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {budget.length > 0 && (
              <section className="flex flex-col gap-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="eyebrow">Remaining budget</span>
                  <span className="text-[13px] text-ink-55">avg last 3 mo</span>
                </div>
                <div className="flex flex-col gap-3">
                  {budget.map((item) => (
                    <div key={item.category} className="flex flex-col gap-[5px]">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[17px] truncate">{item.category}</span>
                        <span
                          className={`text-[17px] tabular-nums shrink-0 ${
                            item.over ? 'text-accent-2-700' : 'text-ink-70'
                          }`}
                        >
                          {item.over
                            ? `−${formatAmount(item.remaining)} over`
                            : `${formatAmount(item.remaining)} left`}
                        </span>
                      </div>
                      <div className="h-2 bg-ink-10">
                        <div
                          className={`h-full ${item.over ? 'bg-accent-2' : 'bg-accent'}`}
                          style={{ width: `${item.pct * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="eyebrow">Six months</span>
                {priorAvg > 0 && (
                  <span className="text-[13px] text-ink-55 tabular-nums">
                    avg {formatWhole(priorAvg)}
                  </span>
                )}
              </div>
              <div className="flex items-end gap-2.5 h-[90px]">
                {trend.map((item, index) => (
                  <div
                    key={item.month}
                    className={`flex-1 ${
                      index === trend.length - 1 ? 'bg-accent' : 'bg-ink-25'
                    }`}
                    style={{ height: `${Math.max(2, (trendTotals[index] / maxTrend) * 100)}%` }}
                    title={`${item.month}: ${formatAmount(trendTotals[index])}`}
                  />
                ))}
              </div>
              <div className="flex gap-2.5 text-xs text-ink-50 tracking-[0.04em]">
                {trend.map((item) => (
                  <span key={item.month} className="flex-1 text-center">
                    {shortMonth(item.month)}
                  </span>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
