import Anthropic from '@anthropic-ai/sdk'
import {
  EXPENSE_CATEGORIES,
  INCOME_SOURCES,
  TAX_OPTIONS,
  ACCOUNTS,
  DEFAULT_CURRENCY,
  DEFAULT_ACCOUNT,
} from './categories'
import type { Entry } from '../types/transaction'

const client = new Anthropic()

const SYSTEM_PROMPT = `You are a financial data extractor. Given an image of a receipt, credit card notification screenshot, bank transfer notification, or payslip, extract ALL transactions visible and return them as strict JSON with no markdown or extra text.

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
  "date": "<YYYY/M/D>",
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
  "date": "<YYYY/MM/DD>",
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

export async function extractFromImage(base64Image: string, mimeType: string): Promise<Entry[]> {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
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

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  // Extract JSON from markdown code block or raw text
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = codeBlock ? codeBlock[1].trim() : text.trim()

  let parsed: { entries: Entry[] } | Entry
  try {
    parsed = JSON.parse(jsonStr) as { entries: Entry[] } | Entry
  } catch {
    throw new Error('Could not identify any transactions in this image. Please try a clearer photo.')
  }

  const entries =
    'entries' in parsed && Array.isArray(parsed.entries)
      ? parsed.entries
      : [parsed as Entry]

  if (entries.length === 0) {
    throw new Error('No transactions found in this image. Please try a different photo.')
  }

  return entries
}
