import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Entry } from '@/types/transaction'

const mockAppend = vi.fn().mockResolvedValue({})

vi.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: vi.fn(function (this: unknown) {
        // constructor mock — instance used as auth credential
        void this
      }),
    },
    sheets: vi.fn().mockReturnValue({
      spreadsheets: { values: { append: mockAppend } },
    }),
  },
}))

describe('appendEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAppend.mockResolvedValue({})
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = JSON.stringify({
      type: 'service_account',
      client_email: 'test@test.iam.gserviceaccount.com',
      private_key: 'key',
    })
    process.env.GOOGLE_SPREADSHEET_ID = 'test-spreadsheet-id'
  })

  it('appends to Expense tab with correct column order', async () => {
    const entry: Entry = {
      type: 'expense',
      expense: 'Coffee',
      amount: 5.5,
      date: '2026/5/16',
      account: 'NAB AUD',
      category: 'Food & Dining',
      currency: 'AUD',
    }

    const { appendEntry } = await import('@/lib/sheets')
    await appendEntry(entry)

    expect(mockAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        range: 'Expense!A:F',
        requestBody: {
          values: [['Coffee', 5.5, '2026/5/16', 'NAB AUD', 'Food & Dining', 'AUD']],
        },
      })
    )
  })

  it('appends to Income tab with correct column order', async () => {
    const entry: Entry = {
      type: 'income',
      income: 'Salary',
      amount: 3000,
      currency: 'AUD',
      date: '2026/05/01',
      source: 'Salary',
      accounts: 'NAB AUD',
      tax: 'after tax',
    }

    const { appendEntry } = await import('@/lib/sheets')
    await appendEntry(entry)

    expect(mockAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        range: 'Income!A:G',
        requestBody: {
          values: [['Salary', 3000, 'AUD', '2026/05/01', 'Salary', 'NAB AUD', 'after tax']],
        },
      })
    )
  })

  it('throws if GOOGLE_SPREADSHEET_ID is not set', async () => {
    delete process.env.GOOGLE_SPREADSHEET_ID
    const { appendEntry } = await import('@/lib/sheets')
    const entry: Entry = {
      type: 'expense',
      expense: 'test',
      amount: 1,
      date: '2026/1/1',
      account: 'NAB AUD',
      category: 'Other',
      currency: 'AUD',
    }
    await expect(appendEntry(entry)).rejects.toThrow('GOOGLE_SPREADSHEET_ID')
  })

  it('throws if GOOGLE_SERVICE_ACCOUNT_KEY is not set', async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    const { appendEntry } = await import('@/lib/sheets')
    const entry: Entry = {
      type: 'expense',
      expense: 'test',
      amount: 1,
      date: '2026/1/1',
      account: 'NAB AUD',
      category: 'Other',
      currency: 'AUD',
    }
    await expect(appendEntry(entry)).rejects.toThrow('GOOGLE_SERVICE_ACCOUNT_KEY')
  })
})

describe('appendEntries', () => {
  const coffee: Entry = {
    type: 'expense',
    expense: 'Coffee',
    amount: 5.5,
    date: '2026-07-01',
    account: 'NAB AUD',
    category: 'Food & Dining',
    currency: 'AUD',
  }
  const lunch: Entry = { ...coffee, expense: 'Lunch', amount: 18 }
  const salary: Entry = {
    type: 'income',
    income: 'Salary',
    amount: 3000,
    currency: 'AUD',
    date: '2026-07-01',
    source: 'Salary',
    accounts: 'NAB AUD',
    tax: 'after tax',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockAppend.mockResolvedValue({})
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = JSON.stringify({
      type: 'service_account',
      client_email: 'test@test.iam.gserviceaccount.com',
      private_key: 'key',
    })
    process.env.GOOGLE_SPREADSHEET_ID = 'test-spreadsheet-id'
  })

  it('writes one request per tab, not one per entry', async () => {
    const { appendEntries } = await import('@/lib/sheets')
    const outcomes = await appendEntries([coffee, salary, lunch])

    expect(mockAppend).toHaveBeenCalledTimes(2)
    expect(mockAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        range: 'Expense!A:F',
        requestBody: {
          values: [
            ['Coffee', 5.5, '2026-07-01', 'NAB AUD', 'Food & Dining', 'AUD'],
            ['Lunch', 18, '2026-07-01', 'NAB AUD', 'Food & Dining', 'AUD'],
          ],
        },
      })
    )
    expect(outcomes).toEqual([
      { tab: 'expense', count: 2, ok: true },
      { tab: 'income', count: 1, ok: true },
    ])
  })

  it('skips a tab with no rows', async () => {
    const { appendEntries } = await import('@/lib/sheets')
    const outcomes = await appendEntries([coffee])

    expect(mockAppend).toHaveBeenCalledTimes(1)
    expect(outcomes).toEqual([{ tab: 'expense', count: 1, ok: true }])
  })

  // A partial write must be reported rather than thrown: the caller drops the rows that
  // landed so a retry can't duplicate them.
  it('reports per-tab outcomes when one tab fails', async () => {
    mockAppend
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Quota exceeded'))

    const { appendEntries } = await import('@/lib/sheets')
    const outcomes = await appendEntries([coffee, salary])

    expect(outcomes).toEqual([
      { tab: 'expense', count: 1, ok: true },
      { tab: 'income', count: 1, ok: false, error: 'Quota exceeded' },
    ])
  })
})
