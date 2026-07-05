import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Entry } from '@/types/transaction'
import { EXPENSE_CATEGORIES, INCOME_SOURCES } from '@/lib/categories'

const mockParse = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function (this: unknown) {
    // @ts-expect-error vitest mock
    this.messages = { parse: mockParse }
  }),
}))

// The SDK zod helper runs for real; we only stub the network call (messages.parse).
const usage = { input_tokens: 100, output_tokens: 50 }

describe('extractFromImageDetailed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the schema-validated expense entries and token usage', async () => {
    const entry: Entry = {
      type: 'expense',
      expense: 'Coffee',
      amount: 5.5,
      date: '2026-05-16',
      account: 'NAB AUD',
      category: 'Food & Dining',
      currency: 'AUD',
    }
    mockParse.mockResolvedValueOnce({
      parsed_output: { entries: [entry] },
      content: [{ type: 'text', text: JSON.stringify({ entries: [entry] }) }],
      usage,
      stop_reason: 'end_turn',
    })

    const { extractFromImageDetailed } = await import('@/lib/claude')
    const result = await extractFromImageDetailed('base64data', 'image/jpeg')
    expect(result.entries).toEqual([entry])
    expect(result.usage).toEqual(usage)
    expect(result.model).toBe('claude-sonnet-4-6')
  })

  it('passes a structured-output format to the model', async () => {
    mockParse.mockResolvedValueOnce({
      parsed_output: {
        entries: [
          {
            type: 'income',
            income: 'Salary',
            amount: 3000,
            currency: 'AUD',
            date: '2026-05-01',
            source: 'Salary',
            accounts: 'NAB AUD',
            tax: 'after tax',
          },
        ],
      },
      content: [],
      usage,
      stop_reason: 'end_turn',
    })

    const { extractFromImage } = await import('@/lib/claude')
    await extractFromImage('base64data', 'image/png')

    const callArgs = mockParse.mock.calls[0][0] as { output_config?: { format?: unknown } }
    expect(callArgs.output_config?.format).toBeDefined()
  })

  it('rejects (throws) when the response fails schema validation', async () => {
    mockParse.mockResolvedValueOnce({
      parsed_output: null,
      content: [{ type: 'text', text: 'I cannot read this image.' }],
      usage,
      stop_reason: 'refusal',
    })

    const { extractFromImageDetailed } = await import('@/lib/claude')
    await expect(extractFromImageDetailed('base64data', 'image/jpeg')).rejects.toThrow()
  })

  it('throws when the model returns zero entries', async () => {
    mockParse.mockResolvedValueOnce({
      parsed_output: { entries: [] },
      content: [],
      usage,
      stop_reason: 'end_turn',
    })

    const { extractFromImageDetailed } = await import('@/lib/claude')
    await expect(extractFromImageDetailed('base64data', 'image/jpeg')).rejects.toThrow()
  })

  it('system prompt includes all expense categories and income sources', async () => {
    mockParse.mockResolvedValueOnce({
      parsed_output: { entries: [] },
      content: [],
      usage,
      stop_reason: 'end_turn',
    })

    const { extractFromImage } = await import('@/lib/claude')
    try {
      await extractFromImage('x', 'image/jpeg')
    } catch {
      // zero-entry throw expected
    }

    const callArgs = mockParse.mock.calls[0][0] as { system: string }
    for (const cat of EXPENSE_CATEGORIES) {
      expect(callArgs.system).toContain(cat)
    }
    for (const src of INCOME_SOURCES) {
      expect(callArgs.system).toContain(src)
    }
  })
})
