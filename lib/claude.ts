import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import {
  EXPENSE_CATEGORIES,
  INCOME_SOURCES,
  TAX_OPTIONS,
  ACCOUNTS,
  DEFAULT_CURRENCY,
  DEFAULT_ACCOUNT,
} from './categories'
import { ExtractionSchema } from './schema'
import type { Entry } from '../types/transaction'

const client = new Anthropic()

function buildSystemPrompt(today: string) {
  return `You are a financial data extractor. Given an image of a receipt, credit card notification screenshot, bank transfer notification, or payslip, extract ALL transactions visible and return them as strict JSON with no markdown or extra text.

Today's date is ${today}. When a date in the image is ambiguous or incomplete (e.g. only shows a day like "Fri 29" or "Nov 29" without a year), assume it is the most recent past occurrence of that date relative to today. If you cannot determine the date at all, use today's date.

Always return an array, even for a single transaction:
{ "entries": [ <entry>, ... ] }

For each transaction, determine if it is an expense or income:
- expense: purchases, bills, fees, subscriptions
- income: salary, rent received, freelance payment, reimbursement

Each EXPENSE entry:
{
  "type": "expense",
  "expense": "<description of what was purchased>",
  "amount": <number, no currency symbol>,
  "date": "<YYYY-MM-DD>",
  "account": "<best matching account from list>",
  "category": "<best matching category from list>",
  "currency": "<3-letter code>"
}

Each INCOME entry:
{
  "type": "income",
  "income": "<description of income source>",
  "amount": <number, no currency symbol>,
  "currency": "<3-letter code>",
  "date": "<YYYY-MM-DD>",
  "source": "<best matching source from list>",
  "accounts": "<best matching account from list>",
  "tax": "<best matching tax option from list>"
}

Expense categories: ${EXPENSE_CATEGORIES.join(', ')}
Income sources: ${INCOME_SOURCES.join(', ')}
Tax options: ${TAX_OPTIONS.join(', ')}
Accounts: ${ACCOUNTS.join(', ')}
Default currency: ${DEFAULT_CURRENCY}
Default account: ${DEFAULT_ACCOUNT}

If you cannot determine a field with confidence, use the most reasonable default. Never return null or omit fields.`
}

const MODEL = 'claude-sonnet-4-6'

export interface ExtractionResult {
  entries: Entry[]
  usage: { input_tokens: number; output_tokens: number }
  model: string
}

/**
 * Extract transactions and return the entries alongside token usage and the model used.
 * The eval harness (`scripts/score.ts`) depends on this to compute cost per receipt.
 */
export async function extractFromImageDetailed(
  base64Image: string,
  mimeType: string
): Promise<ExtractionResult> {
  const today = new Date().toISOString().slice(0, 10)
  // Structured output: the model is constrained to ExtractionSchema, so a malformed
  // response is impossible by design. `parsed_output` is the schema-validated object.
  const message = await client.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    system: buildSystemPrompt(today),
    output_config: { format: zodOutputFormat(ExtractionSchema) },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: base64Image,
            },
          },
          {
            type: 'text',
            text: 'Extract the transaction data from this image.',
          },
        ],
      },
    ],
  })

  const parsed = message.parsed_output
  if (!parsed) {
    // Should be near-zero now decoding is schema-constrained. Log the raw response for triage.
    const raw = message.content.find((b) => b.type === 'text')
    console.error('[extract] response failed schema validation', {
      stop_reason: message.stop_reason,
      raw: raw && raw.type === 'text' ? raw.text : undefined,
    })
    throw new Error(
      'Could not identify any transactions in this image. Please try a clearer photo.'
    )
  }

  if (parsed.entries.length === 0) {
    throw new Error('No transactions found in this image. Please try a different photo.')
  }

  return {
    entries: parsed.entries as Entry[],
    usage: {
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
    },
    model: MODEL,
  }
}

export async function extractFromImage(base64Image: string, mimeType: string): Promise<Entry[]> {
  const { entries } = await extractFromImageDetailed(base64Image, mimeType)
  return entries
}
