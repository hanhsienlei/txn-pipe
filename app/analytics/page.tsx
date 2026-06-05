'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { AnalyticsData } from '@/lib/sheets'

const CATEGORY_COLORS: Record<string, string> = {
  Rent: '#6366f1',
  'Food & Dining': '#f59e0b',
  Health: '#10b981',
  Living: '#3b82f6',
  Growth: '#8b5cf6',
  Shopping: '#f43f5e',
  Entertainment: '#06b6d4',
  Other: '#94a3b8',
}

function colorFor(category: string): string {
  return CATEGORY_COLORS[category] ?? '#94a3b8'
}

export default function AnalyticsPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setData(null)
    fetch(`/api/analytics?year=${year}&month=${month}`)
      .then((res) => res.json())
      .then((d: AnalyticsData | { error: string }) => {
        if ('error' in d) setError(d.error)
        else setData(d)
      })
      .catch(() => setError('Failed to load analytics'))
      .finally(() => setLoading(false))
  }, [year, month])

  function prevMonth() {
    if (month === 1) {
      setMonth(12)
      setYear((y) => y - 1)
    } else {
      setMonth((m) => m - 1)
    }
  }

  function nextMonth() {
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
    if (isCurrentMonth) return
    if (month === 12) {
      setMonth(1)
      setYear((y) => y + 1)
    } else {
      setMonth((m) => m + 1)
    }
  }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const selectedLabel = `${year}/${String(month).padStart(2, '0')}`

  const activeCategories = data
    ? [
        ...new Set([
          ...data.breakdown.map((d) => d.category),
          ...data.trend.flatMap((t) => Object.keys(t).filter((k) => k !== 'month')),
        ]),
      ]
    : []

  const total = data?.breakdown.reduce((sum, d) => sum + d.total, 0) ?? 0

  const budgetData = (() => {
    if (!data) return []
    const avgMap = new Map<string, number>()
    for (const item of data.trend.slice(-3)) {
      for (const [k, v] of Object.entries(item)) {
        if (k === 'month') continue
        avgMap.set(k, (avgMap.get(k) ?? 0) + Number(v))
      }
    }
    return [...avgMap.entries()]
      .map(([category, sum]) => {
        const avg = Math.round((sum / 3) * 100) / 100
        const spent = data.breakdown.find((b) => b.category === category)?.total ?? 0
        const remaining = Math.round((avg - spent) * 100) / 100
        return { category, avg, spent, remaining, pct: Math.min(1, spent / avg), over: remaining < 0 }
      })
      .filter((b) => b.avg > 0)
      .sort((a, b) => b.pct - a.pct)
  })()

  return (
    <main className="flex flex-col min-h-dvh">
      <header className="flex items-center justify-between px-5 pt-12 pb-4">
        <h1 className="text-xl font-bold tracking-tight">Analytics</h1>
        <Link href="/" className="text-sm text-neutral-500 underline-offset-2 hover:underline">
          ← Home
        </Link>
      </header>

      <div className="flex items-center justify-center gap-6 px-5 pb-6">
        <button onClick={prevMonth} className="text-neutral-400 hover:text-neutral-900 text-2xl leading-none px-1">
          ‹
        </button>
        <span className="text-sm font-semibold tabular-nums w-20 text-center">{selectedLabel}</span>
        <button
          onClick={nextMonth}
          disabled={isCurrentMonth}
          className="text-neutral-400 hover:text-neutral-900 text-2xl leading-none px-1 disabled:opacity-20"
        >
          ›
        </button>
      </div>

      <div className="flex-1 px-5 pb-10">
        {loading && <p className="text-center text-neutral-400 text-sm mt-16">Loading…</p>}
        {error && <p className="text-center text-red-500 text-sm mt-16">{error}</p>}

        {data && !loading && (
          <div className="flex flex-col gap-10">
            <section>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-sm font-semibold text-neutral-500">Category Breakdown</h2>
                {total > 0 && (
                  <span className="text-sm font-semibold tabular-nums">${total.toFixed(2)}</span>
                )}
              </div>

              {data.breakdown.length === 0 ? (
                <p className="text-center text-neutral-400 text-sm py-10">No expenses this month.</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={data.breakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        dataKey="total"
                        nameKey="category"
                        strokeWidth={0}
                      >
                        {data.breakdown.map((item) => (
                          <Cell key={item.category} fill={colorFor(item.category)} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => [`$${Number(value).toFixed(2)}`, String(name)]}
                        contentStyle={{ fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>

                  <ul className="flex flex-col gap-2 mt-1">
                    {[...data.breakdown].sort((a, b) => b.total - a.total).map((item) => (
                      <li key={item.category} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ background: colorFor(item.category) }}
                          />
                          <span className="text-sm text-neutral-700">{item.category}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-neutral-400">
                            {total > 0 ? `${Math.round((item.total / total) * 100)}%` : ''}
                          </span>
                          <span className="text-sm font-semibold tabular-nums">${item.total.toFixed(2)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            {budgetData.length > 0 && (
              <section>
                <div className="flex items-baseline justify-between mb-4">
                  <h2 className="text-sm font-semibold text-neutral-500">Remaining Budget</h2>
                  <span className="text-xs text-neutral-400">avg of last 3 months</span>
                </div>
                <ul className="flex flex-col gap-4">
                  {budgetData.map(({ category, avg, spent, remaining, pct, over }) => (
                    <li key={category}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ background: colorFor(category) }}
                          />
                          <span className="text-sm text-neutral-700">{category}</span>
                        </div>
                        <span className={`text-sm font-semibold tabular-nums ${over ? 'text-red-500' : 'text-neutral-700'}`}>
                          {over ? `−$${Math.abs(remaining).toFixed(2)} over` : `$${remaining.toFixed(2)} left`}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-neutral-100 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct * 100}%`,
                            background: over ? '#ef4444' : colorFor(category),
                          }}
                        />
                      </div>
                      <p className="text-xs text-neutral-400 mt-1 tabular-nums">
                        ${spent.toFixed(2)} spent · ${avg.toFixed(2)} avg/mo
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h2 className="text-sm font-semibold text-neutral-500 mb-3">6-Month Trend</h2>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart
                  data={data.trend.map((item, i, arr) => {
                    const window = arr.slice(Math.max(0, i - 2), i + 1)
                    const totals = window.map((t) =>
                      Object.entries(t)
                        .filter(([k]) => k !== 'month')
                        .reduce((sum, [, v]) => sum + Number(v), 0)
                    )
                    const movingAvg = Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 100) / 100
                    return { ...item, movingAvg }
                  })}
                  margin={{ top: 0, right: 0, bottom: 0, left: -20 }}
                >
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: string) => v.slice(5)}
                  />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(value, name) =>
                      name === 'movingAvg'
                        ? [`$${Number(value).toFixed(2)}`, 'Avg']
                        : [`$${Number(value).toFixed(2)}`, name]
                    }
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(value) => (value === 'movingAvg' ? 'Avg' : value)}
                  />
                  {activeCategories.map((cat) => (
                    <Bar key={cat} dataKey={cat} stackId="a" fill={colorFor(cat)} />
                  ))}
                  <Line
                    dataKey="movingAvg"
                    stroke="#374151"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    dot={false}
                    type="monotone"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
