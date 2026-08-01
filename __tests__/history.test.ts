import { describe, it, expect } from 'vitest'
import { merchantKey, categoryHint } from '@/lib/history'
import type { Entry } from '@/types/transaction'

function expense(description: string, category: string): Entry {
  return {
    type: 'expense',
    expense: description,
    amount: 42.8,
    date: '2026-07-12',
    account: 'NAB AUD',
    category,
    currency: 'AUD',
  }
}

describe('merchantKey', () => {
  it('takes the first meaningful word', () => {
    expect(merchantKey('Uber trip — Fitzroy to CBD')).toBe('uber')
    expect(merchantKey('Woolworths Fitzroy')).toBe('woolworths')
  })

  it('matches two trips by the same merchant', () => {
    expect(merchantKey('Uber trip — Fitzroy to CBD')).toBe(
      merchantKey('Uber trip — CBD to Carlton'),
    )
  })

  it('skips leading noise words and short tokens', () => {
    expect(merchantKey('The Grand Cafe')).toBe('grand')
    expect(merchantKey('7 Eleven Carlton')).toBe('eleven')
  })

  it('returns null when there is nothing to match on', () => {
    expect(merchantKey('')).toBeNull()
    expect(merchantKey('12 34')).toBeNull()
  })
})

describe('categoryHint', () => {
  const history = [
    expense('Uber trip — CBD to Carlton', 'Living'),
    expense('Uber trip — Fitzroy to CBD', 'Living'),
    expense('Uber trip — home', 'Living'),
    expense('Woolworths Fitzroy', 'Food & Dining'),
  ]

  it('suggests the category this merchant usually gets', () => {
    expect(categoryHint('Uber trip — Carlton to CBD', 'expense', history)).toEqual({
      label: 'Uber',
      category: 'Living',
      count: 3,
    })
  })

  it('stays quiet for a merchant seen only once', () => {
    expect(categoryHint('Woolworths Carlton', 'expense', history)).toBeNull()
  })

  it('stays quiet for an unseen merchant', () => {
    expect(categoryHint('Chemist Warehouse', 'expense', history)).toBeNull()
  })

  it('stays quiet when the history is split rather than habitual', () => {
    const split = [
      expense('Coles Fitzroy', 'Food & Dining'),
      expense('Coles Carlton', 'Living'),
    ]
    expect(categoryHint('Coles Brunswick', 'expense', split)).toBeNull()
  })

  it('does not cross the income/expense boundary', () => {
    expect(categoryHint('Uber trip — airport', 'income', history)).toBeNull()
  })
})
