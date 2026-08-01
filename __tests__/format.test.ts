import { describe, it, expect } from 'vitest'
import {
  formatAmount,
  formatSigned,
  formatWhole,
  parseEntryDate,
  toDateInputValue,
  formatDayMonth,
  formatDayHeader,
} from '@/lib/format'

/** Narrow no-break space — the thousands separator this UI uses instead of a comma. */
const THIN = ' '

describe('formatAmount', () => {
  it('always shows two decimals', () => {
    expect(formatAmount(88.4)).toBe('88.40')
    expect(formatAmount(51)).toBe('51.00')
  })

  it('groups thousands with a narrow no-break space, not a comma', () => {
    expect(formatAmount(1924.01)).toBe(`1${THIN}924.01`)
    expect(formatAmount(1234567.5)).toBe(`1${THIN}234${THIN}567.50`)
  })

  it('never carries a sign', () => {
    expect(formatAmount(-88.4)).toBe('88.40')
  })
})

describe('formatSigned', () => {
  it('uses a true minus sign for negatives', () => {
    expect(formatSigned(-149.8)).toBe('−149.80')
  })

  it('marks positives with a plus', () => {
    expect(formatSigned(1924.01)).toBe(`+1${THIN}924.01`)
  })

  it('leaves zero unsigned', () => {
    expect(formatSigned(0)).toBe('0.00')
  })
})

describe('formatWhole', () => {
  it('drops the cents', () => {
    expect(formatWhole(1928.44)).toBe(`1${THIN}928`)
  })
})

describe('parseEntryDate', () => {
  it('parses ISO dates', () => {
    expect(parseEntryDate('2026-07-12')?.getMonth()).toBe(6)
    expect(parseEntryDate('2026-07-12')?.getDate()).toBe(12)
  })

  it('parses the legacy YYYY/M/D format', () => {
    expect(parseEntryDate('2026/7/5')?.getDate()).toBe(5)
  })

  it('parses as a local date, so the day never shifts', () => {
    expect(parseEntryDate('2026-07-12')?.getHours()).toBe(0)
  })

  it('returns null for junk', () => {
    expect(parseEntryDate('')).toBeNull()
    expect(parseEntryDate('2026-07')).toBeNull()
  })
})

describe('toDateInputValue', () => {
  it('zero-pads the legacy format for input[type=date]', () => {
    expect(toDateInputValue('2026/7/5')).toBe('2026-07-05')
  })

  it('passes ISO through unchanged', () => {
    expect(toDateInputValue('2026-07-12')).toBe('2026-07-12')
  })

  it('yields an empty value rather than an invalid one', () => {
    expect(toDateInputValue('nonsense')).toBe('')
  })
})

describe('day formatting', () => {
  it('formats a row date as day and month', () => {
    expect(formatDayMonth('2026-07-12')).toBe('12 Jul')
  })

  it('formats a day header with its weekday', () => {
    expect(formatDayHeader('2026-07-12')).toBe('Sun 12 Jul')
  })

  it('falls back to the raw string when it cannot parse', () => {
    expect(formatDayMonth('???')).toBe('???')
  })
})
