import { google } from 'googleapis'
import type { IncomeEntry, ExpenseEntry, Entry } from '../types/transaction'

export interface BreakdownItem {
  category: string
  total: number
}

export interface TrendItem {
  month: string
  [key: string]: number | string
}

export interface AnalyticsData {
  breakdown: BreakdownItem[]
  trend: TrendItem[]
}

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

export async function getExpenseAnalytics(year: number, month: number): Promise<AnalyticsData> {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID
  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID is not set')

  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: '錢錢去哪裡-支出!A:F',
  })

  const rows = res.data.values ?? []

  // Parse expense rows; skip header/invalid rows where amount is not a number
  const expenses = rows
    .map((row) => ({
      amount: parseFloat(row[1]),
      date: String(row[2] ?? ''),
      category: String(row[4] ?? ''),
    }))
    .filter((e) => !isNaN(e.amount) && e.date.includes('/') && e.category)

  // Breakdown for the selected month
  const selectedExpenses = expenses.filter((e) => {
    const parts = e.date.split('/')
    return Number(parts[0]) === year && Number(parts[1]) === month
  })

  const breakdownMap = new Map<string, number>()
  for (const e of selectedExpenses) {
    breakdownMap.set(e.category, (breakdownMap.get(e.category) ?? 0) + e.amount)
  }
  const breakdown: BreakdownItem[] = Array.from(breakdownMap.entries()).map(([category, total]) => ({
    category,
    total: Math.round(total * 100) / 100,
  }))

  // Build last 6 months (oldest → newest, ending at selected month)
  const trendMonths: { year: number; month: number }[] = []
  for (let i = 5; i >= 0; i--) {
    let m = month - i
    let y = year
    while (m <= 0) {
      m += 12
      y--
    }
    trendMonths.push({ year: y, month: m })
  }

  const trend: TrendItem[] = trendMonths.map(({ year: y, month: m }) => {
    const monthExpenses = expenses.filter((e) => {
      const parts = e.date.split('/')
      return Number(parts[0]) === y && Number(parts[1]) === m
    })
    const totals: Record<string, number> = {}
    for (const e of monthExpenses) {
      totals[e.category] = Math.round(((totals[e.category] ?? 0) + e.amount) * 100) / 100
    }
    return { month: `${y}/${String(m).padStart(2, '0')}`, ...totals }
  })

  return { breakdown, trend }
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
