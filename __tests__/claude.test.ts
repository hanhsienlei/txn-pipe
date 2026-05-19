import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Entry } from '@/types/transaction'
import { EXPENSE_CATEGORIES, INCOME_SOURCES } from '@/lib/categories'

const mockCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function (this: unknown) {
    // @ts-expect-error vitest mock
    this.messages = { create: mockCreate }
  }),
}))

describe('extractFromImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses a valid expense JSON response from Claude', async () => {
    const mockEntry: Entry = {
      type: 'expense',
      expense: 'Coffee',
      amount: 5.5,
      date: '2026/5/16',
      account: 'NAB AUD',
      category: 'Food & Dining',
      currency: 'AUD',
    }
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(mockEntry) }],
    })

    const { extractFromImage } = await import('@/lib/claude')
    const result = await extractFromImage('base64data', 'image/jpeg')
    expect(result).toEqual(mockEntry)
  })

  it('parses a valid income JSON response from Claude', async () => {
    const mockEntry: Entry = {
      type: 'income',
      income: 'Salary April',
      amount: 3000,
      currency: 'AUD',
      date: '2026/05/01',
      source: 'Salary',
      accounts: 'NAB AUD',
      tax: 'after tax',
    }
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(mockEntry) }],
    })

    const { extractFromImage } = await import('@/lib/claude')
    const result = await extractFromImage('base64data', 'image/png')
    expect(result).toEqual(mockEntry)
  })

  it('strips markdown code fences from Claude response', async () => {
    const mockEntry: Entry = {
      type: 'expense',
      expense: 'Bus',
      amount: 3.2,
      date: '2026/5/16',
      account: 'NAB AUD',
      category: 'Living',
      currency: 'AUD',
    }
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '```json\n' + JSON.stringify(mockEntry) + '\n```' }],
    })

    const { extractFromImage } = await import('@/lib/claude')
    const result = await extractFromImage('base64data', 'image/jpeg')
    expect(result).toEqual(mockEntry)
  })

  it('throws if Claude returns unparseable text', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'I cannot read this image.' }],
    })

    const { extractFromImage } = await import('@/lib/claude')
    await expect(extractFromImage('base64data', 'image/jpeg')).rejects.toThrow()
  })

  it('system prompt includes all expense categories and income sources', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{}' }],
    })

    const { extractFromImage } = await import('@/lib/claude')
    try {
      await extractFromImage('x', 'image/jpeg')
    } catch {
      // parse error expected
    }

    const callArgs = mockCreate.mock.calls[0][0] as { system: string }
    for (const cat of EXPENSE_CATEGORIES) {
      expect(callArgs.system).toContain(cat)
    }
    for (const src of INCOME_SOURCES) {
      expect(callArgs.system).toContain(src)
    }
  })
})
