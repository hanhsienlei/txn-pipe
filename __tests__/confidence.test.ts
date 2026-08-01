import { describe, it, expect } from 'vitest'
import { deriveConfidence, isDateImplausible, countLow } from '@/lib/confidence'
import type { Entry } from '@/types/transaction'

const NOW = new Date('2026-07-12T10:00:00').getTime()

function expense(overrides: Partial<Extract<Entry, { type: 'expense' }>> = {}): Entry {
  return {
    type: 'expense',
    expense: 'Woolworths Fitzroy',
    amount: 88.4,
    date: '2026-07-12',
    account: 'NAB AUD',
    category: 'Food & Dining',
    currency: 'AUD',
    ...overrides,
  }
}

describe('isDateImplausible', () => {
  it('accepts today', () => {
    expect(isDateImplausible('2026-07-12', NOW)).toBe(false)
  })

  it('accepts a receipt from last month', () => {
    expect(isDateImplausible('2026-06-03', NOW)).toBe(false)
  })

  it('accepts the legacy YYYY/M/D format', () => {
    expect(isDateImplausible('2026/7/1', NOW)).toBe(false)
  })

  it('rejects a date well in the future', () => {
    expect(isDateImplausible('2027-01-01', NOW)).toBe(true)
  })

  it('tolerates a day of slack for timezones', () => {
    expect(isDateImplausible('2026-07-13', NOW)).toBe(false)
  })

  it('rejects a date more than a year old — usually a misread year', () => {
    expect(isDateImplausible('2025-01-01', NOW)).toBe(true)
  })

  it('rejects an unparseable date', () => {
    expect(isDateImplausible('not a date', NOW)).toBe(true)
  })
})

describe('deriveConfidence', () => {
  it('flags nothing on a clean entry', () => {
    expect(deriveConfidence(expense(), NOW)).toEqual({})
  })

  it('flags a category that fell through to Other', () => {
    expect(deriveConfidence(expense({ category: 'Other' }), NOW)).toEqual({ category: 'low' })
  })

  it('flags an implausible date', () => {
    expect(deriveConfidence(expense({ date: '2019-07-12' }), NOW)).toEqual({ date: 'low' })
  })

  it('flags both when both are suspect', () => {
    const flags = deriveConfidence(expense({ category: 'Other', date: '2030-01-01' }), NOW)
    expect(countLow(flags)).toBe(2)
  })

  it('reads Other from an income entry source', () => {
    const income: Entry = {
      type: 'income',
      income: 'Transfer',
      amount: 500,
      currency: 'AUD',
      date: '2026-07-12',
      source: 'Other',
      accounts: 'NAB AUD',
      tax: 'no tax',
    }
    expect(deriveConfidence(income, NOW)).toEqual({ category: 'low' })
  })
})
