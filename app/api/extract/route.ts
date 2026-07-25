import { NextRequest, NextResponse } from 'next/server'
import { extractFromImage } from '@/lib/claude'

// Extraction runs p95 ~7.3s per image and the platform default is tighter than that
// leaves room for; a batch fans out four of these at once, so give the tail somewhere to go.
export const maxDuration = 30

export async function POST(req: NextRequest) {
  let body: { image?: string; mimeType?: string }
  try {
    body = (await req.json()) as { image?: string; mimeType?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.image) {
    return NextResponse.json({ error: 'Missing image field' }, { status: 400 })
  }

  const mimeType = body.mimeType ?? 'image/jpeg'

  try {
    const entries = await extractFromImage(body.image, mimeType)
    return NextResponse.json({ entries })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
