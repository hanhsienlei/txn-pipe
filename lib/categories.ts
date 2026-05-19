export const EXPENSE_CATEGORIES = [
  'Rent',
  'Food & Dining',
  'Health',
  'Living',
  'Growth',
  'Shopping',
  'Entertainment',
  'Other',
] as const

export const INCOME_SOURCES = [
  'Salary',
  'Rent',
  'Freelance',
  'Investment',
  'Bonus',
  'Reimbursement',
  'Other',
] as const

export const TAX_OPTIONS = ['no tax', 'after tax', 'pre-tax'] as const

export const ACCOUNTS = ['NAB AUD', 'NAB TWD'] as const

export const DEFAULT_CURRENCY = 'AUD'
export const DEFAULT_ACCOUNT = ACCOUNTS[0]

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]
export type IncomeSource = (typeof INCOME_SOURCES)[number]
export type TaxOption = (typeof TAX_OPTIONS)[number]
export type Account = (typeof ACCOUNTS)[number]
