import type { Entry } from '../types/transaction'

// Field-level scoring of extracted entries against hand-verified golden ground truth.
// See CONTEXT.md § Scoring: exact match on amount, date (normalized numerically),
// category/source and the other enum fields; description text is scored on format only
// (non-empty string), never on exact wording.

type CompareMode = 'exact' | 'amount' | 'date' | 'format'

interface ScoredField {
  field: string
  value: unknown
  mode: CompareMode
}

export interface FieldResult {
  field: string
  correct: boolean
  expected: unknown
  actual: unknown
}

export interface ReceiptScore {
  id: string
  totalFields: number
  correctFields: number
  wrongFields: number
  accuracy: number
  entryCountExpected: number
  entryCountActual: number
  fields: FieldResult[]
}

export interface AggregateScore {
  receipts: number
  totalFields: number
  correctFields: number
  fieldAccuracy: number
  avgFieldsWrongPerReceipt: number
  perField: Record<string, { correct: number; total: number; accuracy: number }>
}

function scoredFieldsFor(entry: Entry): ScoredField[] {
  if (entry.type === 'income') {
    return [
      { field: 'type', value: entry.type, mode: 'exact' },
      { field: 'income', value: entry.income, mode: 'format' },
      { field: 'amount', value: entry.amount, mode: 'amount' },
      { field: 'currency', value: entry.currency, mode: 'exact' },
      { field: 'date', value: entry.date, mode: 'date' },
      { field: 'source', value: entry.source, mode: 'exact' },
      { field: 'accounts', value: entry.accounts, mode: 'exact' },
      { field: 'tax', value: entry.tax, mode: 'exact' },
    ]
  }
  return [
    { field: 'type', value: entry.type, mode: 'exact' },
    { field: 'expense', value: entry.expense, mode: 'format' },
    { field: 'amount', value: entry.amount, mode: 'amount' },
    { field: 'date', value: entry.date, mode: 'date' },
    { field: 'account', value: entry.account, mode: 'exact' },
    { field: 'category', value: entry.category, mode: 'exact' },
    { field: 'currency', value: entry.currency, mode: 'exact' },
  ]
}

function normalizeDate(value: unknown): { y: number; m: number; d: number } | null {
  if (typeof value !== 'string') return null
  const parts = value.trim().split(/[-/]/)
  if (parts.length !== 3) return null
  const [y, m, d] = parts.map((p) => Number(p))
  if ([y, m, d].some((n) => !Number.isFinite(n))) return null
  return { y, m, d }
}

function fieldsEqual(mode: CompareMode, expected: unknown, actual: unknown): boolean {
  switch (mode) {
    case 'amount': {
      const a = typeof expected === 'number' ? expected : Number(expected)
      const b = typeof actual === 'number' ? actual : Number(actual)
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false
      return Math.abs(a - b) < 0.005
    }
    case 'date': {
      const a = normalizeDate(expected)
      const b = normalizeDate(actual)
      if (!a || !b) return false
      return a.y === b.y && a.m === b.m && a.d === b.d
    }
    case 'format':
      // Description text — correct as long as the model produced a non-empty string.
      return typeof actual === 'string' && actual.trim().length > 0
    case 'exact':
      if (typeof expected === 'string' && typeof actual === 'string') {
        return expected.trim().toLowerCase() === actual.trim().toLowerCase()
      }
      return expected === actual
  }
}

/** Score a single expected entry against the aligned actual entry (which may be missing). */
function compareEntry(expected: Entry, actual: Entry | undefined): FieldResult[] {
  const actualRecord = actual as Record<string, unknown> | undefined
  return scoredFieldsFor(expected).map(({ field, value, mode }) => {
    const actualValue = actualRecord?.[field]
    return {
      field,
      correct: actual ? fieldsEqual(mode, value, actualValue) : false,
      expected: value,
      actual: actualValue,
    }
  })
}

/**
 * Score one receipt. Expected and actual entries are aligned by index. A missing actual
 * entry counts every expected field wrong; a spurious extra actual entry is penalized by
 * counting each of its scored fields as wrong (added to both total and wrong).
 */
export function scoreReceipt(id: string, expected: Entry[], actual: Entry[]): ReceiptScore {
  const fields: FieldResult[] = []

  for (let i = 0; i < expected.length; i++) {
    fields.push(...compareEntry(expected[i], actual[i]))
  }

  // Penalize hallucinated extra entries the model produced beyond ground truth.
  for (let i = expected.length; i < actual.length; i++) {
    for (const sf of scoredFieldsFor(actual[i])) {
      fields.push({ field: sf.field, correct: false, expected: undefined, actual: sf.value })
    }
  }

  const correctFields = fields.filter((f) => f.correct).length
  const totalFields = fields.length
  return {
    id,
    totalFields,
    correctFields,
    wrongFields: totalFields - correctFields,
    accuracy: totalFields === 0 ? 0 : correctFields / totalFields,
    entryCountExpected: expected.length,
    entryCountActual: actual.length,
    fields,
  }
}

export function aggregate(scores: ReceiptScore[]): AggregateScore {
  const perField: Record<string, { correct: number; total: number; accuracy: number }> = {}
  let totalFields = 0
  let correctFields = 0

  for (const score of scores) {
    totalFields += score.totalFields
    correctFields += score.correctFields
    for (const f of score.fields) {
      const bucket = (perField[f.field] ??= { correct: 0, total: 0, accuracy: 0 })
      bucket.total += 1
      if (f.correct) bucket.correct += 1
    }
  }

  for (const bucket of Object.values(perField)) {
    bucket.accuracy = bucket.total === 0 ? 0 : bucket.correct / bucket.total
  }

  const wrongTotal = totalFields - correctFields
  return {
    receipts: scores.length,
    totalFields,
    correctFields,
    fieldAccuracy: totalFields === 0 ? 0 : correctFields / totalFields,
    avgFieldsWrongPerReceipt: scores.length === 0 ? 0 : wrongTotal / scores.length,
    perField,
  }
}
