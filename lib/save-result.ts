'use client'

import type { Entry } from '@/types/transaction'
import type { AppendOutcome, SheetInfo, TabName } from './sheets'

/**
 * What a successful save wrote, handed from the review wizard to `/saved`.
 *
 * The saved screen has to name the sheet, the tab and the exact rows, and none of that
 * survives the batch being deleted — so it is captured at the moment of the write rather
 * than re-derived afterwards.
 */
export interface SaveResult {
  savedAt: number
  sheetTitle: string
  spreadsheetId: string | null
  writes: {
    tab: TabName
    tabName: string
    gid?: number
    count: number
    rowStart?: number
    rowEnd?: number
  }[]
  entries: Entry[]
}

const SAVE_RESULT_KEY = 'txnpipe_save_result'

export function buildSaveResult(
  entries: Entry[],
  outcomes: AppendOutcome[],
  info: SheetInfo | null,
): SaveResult {
  return {
    savedAt: Date.now(),
    sheetTitle: info?.title ?? 'your sheet',
    spreadsheetId: info?.spreadsheetId ?? null,
    writes: outcomes
      .filter((outcome) => outcome.ok)
      .map((outcome) => ({
        tab: outcome.tab,
        tabName: info?.tabs[outcome.tab]?.name ?? outcome.tab,
        gid: info?.tabs[outcome.tab]?.gid,
        count: outcome.count,
        rowStart: outcome.rowStart,
        rowEnd: outcome.rowEnd,
      })),
    entries,
  }
}

export function writeSaveResult(result: SaveResult): void {
  sessionStorage.setItem(SAVE_RESULT_KEY, JSON.stringify(result))
}

export function readSaveResult(): SaveResult | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(SAVE_RESULT_KEY)
    return raw ? (JSON.parse(raw) as SaveResult) : null
  } catch {
    return null
  }
}

export function clearSaveResult(): void {
  sessionStorage.removeItem(SAVE_RESULT_KEY)
}
