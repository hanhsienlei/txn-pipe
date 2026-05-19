import { NextRequest, NextResponse } from 'next/server'
import { appendEntry } from '@/lib/sheets'
import type { Entry } from '@/types/transaction'

export async function POST(req: NextRequest) {
  let entry: Entry
  try {
    entry = (await req.json()) as Entry
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!entry.type || !['income', 'expense'].includes(entry.type)) {
    return NextResponse.json({ error: 'Invalid entry type' }, { status: 400 })
  }

  try {
    await appendEntry(entry)
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to write to Sheets'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
