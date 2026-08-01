/**
 * The local record of what has been written to the sheet — the source for the History
 * screen, the "Last logged" footer, and the category hint on the fixing-a-category step.
 */
import type { Entry } from '@/types/transaction'

const HISTORY_KEY = 'txnpipe_history'
const MAX_ROWS = 100

export function describeEntry(entry: Entry): string {
  return entry.type === 'income' ? entry.income : entry.expense
}

export function categoryOf(entry: Entry): string {
  return entry.type === 'income' ? entry.source : entry.category
}

export function accountOf(entry: Entry): string {
  return entry.type === 'income' ? entry.accounts : entry.account
}

/** Newest first. Never throws — a corrupt blob reads as an empty history. */
export function readHistory(): Entry[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
    return Array.isArray(parsed) ? (parsed as Entry[]) : []
  } catch {
    return []
  }
}

export function prependHistory(entries: Entry[]): void {
  const history = readHistory()
  history.unshift(...entries)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_ROWS)))
}

const STOP_WORDS = new Set(['the', 'a', 'an', 'pty', 'ltd', 'inc'])

/**
 * The merchant key of a description: its first meaningful word, lowercased.
 *
 * "Uber trip — Fitzroy to CBD" and "Uber trip — CBD to Carlton" are the same merchant and
 * differ only in their tail, so the head of the string is what identifies them. Anything
 * shorter than three letters is too weak to match on.
 */
export function merchantKey(description: string): string | null {
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word) && !/^\d+$/.test(word))
  return words[0] ?? null
}

export interface CategoryHint {
  /** The merchant as it was written, e.g. `Uber`. */
  label: string
  category: string
  count: number
}

/** Past entries consulted for the hint — enough to be a habit, recent enough to be current. */
const HINT_WINDOW = 10
const HINT_MIN_MATCHES = 2

/**
 * "Your last 3 Uber entries went to Living" — a suggestion drawn from what you already
 * filed, shown above the category chips.
 *
 * Only offered when the merchant's recent history actually agrees: at least two past
 * entries, and a strict majority of them on one category. A split history is not a hint,
 * it's noise, so nothing is shown.
 */
export function categoryHint(
  description: string,
  type: Entry['type'],
  history: Entry[],
): CategoryHint | null {
  const key = merchantKey(description)
  if (!key) return null

  const matches = history
    .filter((entry) => entry.type === type && merchantKey(describeEntry(entry)) === key)
    .slice(0, HINT_WINDOW)
  if (matches.length < HINT_MIN_MATCHES) return null

  const tally = new Map<string, number>()
  for (const entry of matches) {
    const category = categoryOf(entry)
    tally.set(category, (tally.get(category) ?? 0) + 1)
  }

  const [category, count] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]
  if (count * 2 <= matches.length) return null

  // Show the merchant as the receipt spelled it, not as the match key.
  const label = describeEntry(matches[0]).split(/[\s—-]+/)[0] || key
  return { label, category, count }
}
