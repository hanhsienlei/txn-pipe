import { NextRequest, NextResponse } from 'next/server'
import { getExpenseAnalytics } from '@/lib/sheets'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const year = parseInt(searchParams.get('year') ?? '')
  const month = parseInt(searchParams.get('month') ?? '')

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Invalid year or month' }, { status: 400 })
  }

  try {
    const data = await getExpenseAnalytics(year, month)
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch analytics'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
