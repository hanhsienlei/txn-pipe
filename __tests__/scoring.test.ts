import { describe, it, expect } from 'vitest'
import { scoreReceipt, aggregate } from '@/lib/scoring'
import type { Entry, ExpenseEntry, IncomeEntry } from '@/types/transaction'

const expense = (over: Partial<ExpenseEntry> = {}): ExpenseEntry => ({
  type: 'expense',
  expense: 'Coffee',
  amount: 5.5,
  date: '2026-06-16',
  account: 'NAB AUD',
  category: 'Food & Dining',
  currency: 'AUD',
  ...over,
})

const income = (over: Partial<IncomeEntry> = {}): IncomeEntry => ({
  type: 'income',
  income: 'Salary',
  amount: 343.5,
  currency: 'AUD',
  date: '2026-06-09',
  source: 'Salary',
  accounts: 'NAB AUD',
  tax: 'after tax',
  ...over,
})

describe('scoreReceipt', () => {
  it('scores a perfect expense match as 7/7', () => {
    const s = scoreReceipt('001', [expense()], [expense()])
    expect(s.totalFields).toBe(7)
    expect(s.correctFields).toBe(7)
    expect(s.accuracy).toBe(1)
  })

  it('scores a perfect income match as 8/8', () => {
    const s = scoreReceipt('002', [income()], [income()])
    expect(s.totalFields).toBe(8)
    expect(s.correctFields).toBe(8)
  })

  it('treats date format differences as correct when the day/month/year match', () => {
    const s = scoreReceipt('x', [expense({ date: '2026-06-16' })], [expense({ date: '2026/6/16' })])
    expect(s.accuracy).toBe(1)
  })

  it('counts a wrong amount as a single wrong field', () => {
    const s = scoreReceipt('x', [expense({ amount: 5.5 })], [expense({ amount: 6.5 })])
    expect(s.correctFields).toBe(6)
    expect(s.wrongFields).toBe(1)
    expect(s.fields.find((f) => f.field === 'amount')?.correct).toBe(false)
  })

  it('accepts amounts within rounding tolerance', () => {
    const s = scoreReceipt('x', [expense({ amount: 75.3 })], [expense({ amount: 75.3001 })])
    expect(s.accuracy).toBe(1)
  })

  it('scores description on format only — any non-empty string is correct', () => {
    const s = scoreReceipt(
      'x',
      [expense({ expense: 'Latte at cafe' })],
      [expense({ expense: 'coffee purchase' })]
    )
    expect(s.fields.find((f) => f.field === 'expense')?.correct).toBe(true)
  })

  it('marks an empty description wrong', () => {
    const s = scoreReceipt('x', [expense()], [expense({ expense: '   ' })])
    expect(s.fields.find((f) => f.field === 'expense')?.correct).toBe(false)
  })

  it('compares enum fields case-insensitively after trimming', () => {
    const s = scoreReceipt(
      'x',
      [expense({ category: 'Food & Dining' })],
      [expense({ category: ' food & dining ' })]
    )
    expect(s.fields.find((f) => f.field === 'category')?.correct).toBe(true)
  })

  it('counts every field wrong when the actual entry is missing', () => {
    const s = scoreReceipt('x', [expense()], [])
    expect(s.correctFields).toBe(0)
    expect(s.totalFields).toBe(7)
  })

  it('penalizes a hallucinated extra entry', () => {
    const s = scoreReceipt('x', [expense()], [expense(), expense()])
    expect(s.totalFields).toBe(14)
    expect(s.correctFields).toBe(7) // first matches; the extra is all-wrong
  })

  it('penalizes a type mismatch (expense expected, income produced)', () => {
    const s = scoreReceipt('x', [expense()], [income() as unknown as Entry])
    expect(s.fields.find((f) => f.field === 'type')?.correct).toBe(false)
    expect(s.correctFields).toBeLessThan(s.totalFields)
  })
})

describe('aggregate', () => {
  it('rolls up field accuracy and per-field breakdown across receipts', () => {
    const scores = [
      scoreReceipt('a', [expense()], [expense({ amount: 999 })]), // amount wrong
      scoreReceipt('b', [expense()], [expense()]), // perfect
    ]
    const agg = aggregate(scores)
    expect(agg.receipts).toBe(2)
    expect(agg.totalFields).toBe(14)
    expect(agg.correctFields).toBe(13)
    expect(agg.fieldAccuracy).toBeCloseTo(13 / 14)
    expect(agg.avgFieldsWrongPerReceipt).toBe(0.5)
    expect(agg.perField.amount).toEqual({ correct: 1, total: 2, accuracy: 0.5 })
  })
})
