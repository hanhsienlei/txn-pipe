/**
 * Which extracted fields to flag as "I wasn't sure about this".
 *
 * This is DERIVED from the entry, deliberately — flagging confidence at the source would
 * mean changing the extraction prompt and `ExtractionSchema`, which are the eval-gated
 * output contract (AGENTS.md invariant 2). Nothing here touches that contract: the same
 * validated `Entry` goes in, and a purely advisory hint comes out.
 *
 * The two rules cover the two fields that are wrong most often:
 *
 * - **Category** — the enum is closed, so a model that couldn't tell has exactly one
 *   escape hatch: `Other`. A category that fell through to `Other` is a shrug, not a
 *   classification.
 * - **Date** — a receipt that prints `12 JUL` with no year forces the model to guess one,
 *   and a wrong guess lands the row a year out. A date outside the plausible window
 *   (tomorrow onwards, or more than a year back) is that guess going wrong.
 */
import type { Entry } from '@/types/transaction'
import { parseEntryDate } from './format'

/** Fields a reviewer can be warned about. Others are never flagged. */
export type ConfidenceField = 'date' | 'category'

export type FieldConfidence = Partial<Record<ConfidenceField, 'low'>>

const DAY_MS = 24 * 60 * 60 * 1000
/** A receipt older than this is far more likely a misread year than a real backlog. */
const MAX_AGE_DAYS = 365

function categoryOf(entry: Entry): string {
  return entry.type === 'income' ? entry.source : entry.category
}

export function isDateImplausible(date: string, now = Date.now()): boolean {
  const parsed = parseEntryDate(date)
  if (!parsed) return true
  const age = now - parsed.getTime()
  // Tomorrow onwards is impossible for a receipt; a full day of slack absorbs timezones.
  if (age < -DAY_MS) return true
  return age > MAX_AGE_DAYS * DAY_MS
}

export function deriveConfidence(entry: Entry, now = Date.now()): FieldConfidence {
  const confidence: FieldConfidence = {}
  if (categoryOf(entry) === 'Other') confidence.category = 'low'
  if (isDateImplausible(entry.date, now)) confidence.date = 'low'
  return confidence
}

export function countLow(confidence: FieldConfidence): number {
  return Object.values(confidence).filter((level) => level === 'low').length
}
