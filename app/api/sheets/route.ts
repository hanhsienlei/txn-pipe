import { NextRequest, NextResponse } from 'next/server'
import { appendEntries, getSheetInfo } from '@/lib/sheets'
import type { Entry } from '@/types/transaction'

/** Where this app writes: the spreadsheet's name and tab ids, stated on every screen. */
export async function GET() {
  try {
    return NextResponse.json(await getSheetInfo())
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read sheet info'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  let body: { entries?: Entry[] }
  try {
    body = (await req.json()) as { entries?: Entry[] }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const entries = body.entries
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: 'Missing entries' }, { status: 400 })
  }
  if (entries.some((entry) => !['income', 'expense'].includes(entry?.type))) {
    return NextResponse.json({ error: 'Invalid entry type' }, { status: 400 })
  }

  try {
    const outcomes = await appendEntries(entries)
    const success = outcomes.every((outcome) => outcome.ok)
    // 502 on a partial write: the client re-sends only the tabs that failed.
    return NextResponse.json({ success, outcomes }, { status: success ? 200 : 502 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to write to Sheets'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
