import { NextRequest, NextResponse } from 'next/server'
import { appendEntries } from '@/lib/sheets'
import type { Entry } from '@/types/transaction'

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
