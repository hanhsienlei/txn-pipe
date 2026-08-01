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

// Sheet tab names are personal config, not code. Read at call time so tests
// (which set env in beforeEach) and different deployments both work.
function expenseTab(): string {
  return process.env.SHEET_EXPENSE_TAB ?? 'Expense'
}

function incomeTab(): string {
  return process.env.SHEET_INCOME_TAB ?? 'Income'
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

// Extraction now writes ISO `YYYY-MM-DD`, but historical rows may still be stored in the
// legacy `YYYY/M/D` format. Parse both so old analytics rows aren't silently dropped.
function parseYearMonth(date: string): { year: number; month: number } | null {
  const parts = date.split(/[-/]/)
  if (parts.length < 2) return null
  const year = Number(parts[0])
  const month = Number(parts[1])
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null
  return { year, month }
}

export async function getExpenseAnalytics(year: number, month: number): Promise<AnalyticsData> {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID
  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID is not set')

  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${expenseTab()}!A:F`,
  })

  const rows = res.data.values ?? []

  // Parse expense rows; skip header/invalid rows where amount is not a number
  const expenses = rows
    .map((row) => ({
      amount: parseFloat(row[1]),
      date: String(row[2] ?? ''),
      category: String(row[4] ?? ''),
    }))
    .filter((e) => !isNaN(e.amount) && parseYearMonth(e.date) !== null && e.category)

  // Breakdown for the selected month
  const selectedExpenses = expenses.filter((e) => {
    const ym = parseYearMonth(e.date)
    return ym?.year === year && ym.month === month
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
      const ym = parseYearMonth(e.date)
      return ym?.year === y && ym.month === m
    })
    const totals: Record<string, number> = {}
    for (const e of monthExpenses) {
      totals[e.category] = Math.round(((totals[e.category] ?? 0) + e.amount) * 100) / 100
    }
    return { month: `${y}-${String(m).padStart(2, '0')}`, ...totals }
  })

  return { breakdown, trend }
}

export type TabName = 'income' | 'expense'

export interface AppendOutcome {
  tab: TabName
  count: number
  ok: boolean
  error?: string
  /** First and last sheet row written, from the append response. Absent if it didn't report one. */
  rowStart?: number
  rowEnd?: number
}

export interface TabInfo {
  /** The tab's title in the spreadsheet, e.g. `Expense`. */
  name: string
  /** Sheet id, for deep-linking straight to the tab. */
  gid: number
}

export interface SheetInfo {
  spreadsheetId: string
  /** The spreadsheet's own name, e.g. `Household 2026`. Stated on every screen. */
  title: string
  tabs: Partial<Record<TabName, TabInfo>>
}

/**
 * The spreadsheet's name and tab ids, so the UI can say where it is writing and link
 * into the exact rows it wrote.
 */
export async function getSheetInfo(): Promise<SheetInfo> {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID
  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID is not set')

  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'properties.title,sheets.properties(title,sheetId)',
  })

  const byTitle = new Map<string, number>()
  for (const sheet of res.data.sheets ?? []) {
    const title = sheet.properties?.title
    const sheetId = sheet.properties?.sheetId
    if (title && typeof sheetId === 'number') byTitle.set(title, sheetId)
  }

  const tabs: SheetInfo['tabs'] = {}
  for (const [tab, name] of [
    ['expense', expenseTab()],
    ['income', incomeTab()],
  ] as const) {
    const gid = byTitle.get(name)
    if (gid !== undefined) tabs[tab] = { name, gid }
  }

  return { spreadsheetId, title: res.data.properties?.title ?? 'your sheet', tabs }
}

/**
 * `'Expense'!A214:F218` → rows 214–218. The API reports what it actually appended, which
 * is the only trustworthy source for "rows 214–218" on the saved screen — computing it
 * from a row count would drift the moment anything else writes to the sheet.
 */
export function parseUpdatedRange(range: string | null | undefined): {
  rowStart?: number
  rowEnd?: number
} {
  if (!range) return {}
  const cells = range.includes('!') ? range.slice(range.lastIndexOf('!') + 1) : range
  const rows = [...cells.matchAll(/[A-Z]+(\d+)/g)].map((match) => Number(match[1]))
  if (!rows.length) return {}
  return { rowStart: Math.min(...rows), rowEnd: Math.max(...rows) }
}

/**
 * Appends a whole batch with one `values.append` per destination tab.
 *
 * Writing entries one request at a time meant a failure halfway through a batch left the
 * earlier rows already in the sheet with nothing recording that — so retrying duplicated
 * them. Collapsing to at most two calls shrinks the partial-failure window to "one tab
 * wrote, the other didn't", and the per-tab outcomes let the caller re-send only what
 * actually failed.
 */
export async function appendEntries(entries: Entry[]): Promise<AppendOutcome[]> {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID
  if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID is not set')

  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const groups = [
    {
      tab: 'expense' as const,
      range: `${expenseTab()}!A:F`,
      rows: entries.filter((e) => e.type === 'expense').map(toExpenseRow),
    },
    {
      tab: 'income' as const,
      range: `${incomeTab()}!A:G`,
      rows: entries.filter((e) => e.type === 'income').map(toIncomeRow),
    },
  ].filter((group) => group.rows.length > 0)

  const outcomes: AppendOutcome[] = []
  for (const group of groups) {
    try {
      const res = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: group.range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: group.rows },
      })
      outcomes.push({
        tab: group.tab,
        count: group.rows.length,
        ok: true,
        ...parseUpdatedRange(res?.data?.updates?.updatedRange),
      })
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to write to Sheets'
      outcomes.push({ tab: group.tab, count: group.rows.length, ok: false, error })
    }
  }

  return outcomes
}

export async function appendEntry(entry: Entry): Promise<void> {
  const [outcome] = await appendEntries([entry])
  if (outcome && !outcome.ok) throw new Error(outcome.error)
}
