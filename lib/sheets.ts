import { google } from 'googleapis'
import type { IncomeEntry, ExpenseEntry, Entry } from '../types/transaction'

function getAuth() {
  const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!keyRaw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not set')

  let key: { client_email: string; private_key: string }
  try {
    key = JSON.parse(keyRaw) as { client_email: string; private_key: string }
  } catch {
    // .env files sometimes double-escape backslashes — try fixing \n in private key
    const fixed = keyRaw.replace(/\\n/g, '\n')
    key = JSON.parse(fixed) as { client_email: string; private_key: string }
  }
  key.private_key = key.private_key.replace(/\\n/g, '\n')

  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

function toIncomeRow(entry: IncomeEntry): (string | number)[] {
  return [entry.income, entry.amount, entry.currency, entry.date, entry.source, entry.accounts, entry.tax]
}

function toExpenseRow(entry: ExpenseEntry): (string | number)[] {
  return [entry.expense, entry.amount, entry.date, entry.account, entry.category, entry.currency]
}

export async function appendEntry(entry: Entry): Promise<void> {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID
  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID is not set')

  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const range = entry.type === 'income' ? '錢錢去哪裡-收入!A:G' : '錢錢去哪裡-支出!A:F'
  const row = entry.type === 'income' ? toIncomeRow(entry) : toExpenseRow(entry)

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  })
}
