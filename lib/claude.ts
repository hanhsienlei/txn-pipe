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

const SYSTEM_PROMPT = `You are a financial data extractor. Given an image of a receipt, credit card notification screenshot, bank transfer notification, or payslip, extract the transaction data and return it as strict JSON with no markdown or extra text.

Determine if this is an expense or income:
- expense: purchases, bills, fees, subscriptions
- income: salary, rent received, freelance payment, reimbursement

For EXPENSE return exactly:
{
  "type": "expense",
  "expense": "<description of what was purchased>",
  "amount": <number, no currency symbol>,
  "date": "<YYYY/M/D>",
  "account": "<best matching account from list>",
  "category": "<best matching category from list>",
  "currency": "<3-letter code>"
}

For INCOME return exactly:
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

export async function extractFromImage(base64Image: string, mimeType: string): Promise<Entry> {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
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
  const cleaned = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')

  try {
    const parsed = JSON.parse(cleaned) as Entry
    return parsed
  } catch {
    throw new Error(`Failed to parse Claude response: ${text}`)
  }
}
