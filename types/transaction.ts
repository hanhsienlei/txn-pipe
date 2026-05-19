export interface IncomeEntry {
  type: 'income'
  income: string
  amount: number
  currency: string
  date: string // YYYY/MM/DD
  source: string
  accounts: string
  tax: string
}

export interface ExpenseEntry {
  type: 'expense'
  expense: string
  amount: number
  date: string // YYYY/M/D
  account: string
  category: string
  currency: string
}

export type Entry = IncomeEntry | ExpenseEntry
