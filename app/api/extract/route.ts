import { NextRequest, NextResponse } from 'next/server'
import { extractFromImage } from '@/lib/claude'

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
    const entry = await extractFromImage(body.image, mimeType)
    return NextResponse.json(entry)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
