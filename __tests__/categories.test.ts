import { describe, it, expect } from 'vitest'
import {
  EXPENSE_CATEGORIES,
  INCOME_SOURCES,
  TAX_OPTIONS,
  ACCOUNTS,
  DEFAULT_CURRENCY,
  DEFAULT_ACCOUNT,
} from '@/lib/categories'

describe('categories', () => {
  it('exports expected expense categories', () => {
    expect(EXPENSE_CATEGORIES).toContain('Rent')
    expect(EXPENSE_CATEGORIES).toContain('Food & Dining')
    expect(EXPENSE_CATEGORIES).toContain('Other')
  })

  it('has no duplicate expense categories', () => {
    expect(new Set(EXPENSE_CATEGORIES).size).toBe(EXPENSE_CATEGORIES.length)
  })

  it('exports expected income sources', () => {
    expect(INCOME_SOURCES).toContain('Salary')
    expect(INCOME_SOURCES).toContain('Rent')
    expect(INCOME_SOURCES).toContain('Other')
  })

  it('has no duplicate income sources', () => {
    expect(new Set(INCOME_SOURCES).size).toBe(INCOME_SOURCES.length)
  })

  it('exports tax options', () => {
    expect(TAX_OPTIONS).toContain('no tax')
    expect(TAX_OPTIONS).toContain('after tax')
  })

  it('exports accounts', () => {
    expect(ACCOUNTS.length).toBeGreaterThan(0)
  })

  it('default account is first in accounts list', () => {
    expect(DEFAULT_ACCOUNT).toBe(ACCOUNTS[0])
  })

  it('default currency is a 3-letter code', () => {
    expect(DEFAULT_CURRENCY).toMatch(/^[A-Z]{3}$/)
  })
})
