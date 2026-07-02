import { z } from 'zod'
import { EXPENSE_CATEGORIES, INCOME_SOURCES, TAX_OPTIONS, ACCOUNTS } from './categories'

// The output contract for extraction, expressed once as a zod schema. It is used two ways:
//   1. Mirrored to a JSON schema (via `zodOutputFormat`) and sent to the model as a
//      structured-output constraint, so a malformed response is impossible by design.
//   2. As a runtime validator on the response — anything that fails to parse is rejected
//      and logged (should be near-zero now that decoding is schema-constrained).
// Enum fields are constrained to the known category/account/source/tax lists, so the model
// literally cannot emit an out-of-vocabulary value.

export const ExpenseEntrySchema = z.object({
  type: z.literal('expense'),
  expense: z.string(),
  amount: z.number(),
  date: z.string(),
  account: z.enum(ACCOUNTS),
  category: z.enum(EXPENSE_CATEGORIES),
  currency: z.string(),
})

export const IncomeEntrySchema = z.object({
  type: z.literal('income'),
  income: z.string(),
  amount: z.number(),
  currency: z.string(),
  date: z.string(),
  source: z.enum(INCOME_SOURCES),
  accounts: z.enum(ACCOUNTS),
  tax: z.enum(TAX_OPTIONS),
})

export const EntrySchema = z.discriminatedUnion('type', [ExpenseEntrySchema, IncomeEntrySchema])

export const ExtractionSchema = z.object({
  entries: z.array(EntrySchema),
})

export type SchemaEntry = z.infer<typeof EntrySchema>
export type SchemaExtraction = z.infer<typeof ExtractionSchema>
