import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { password } = (await req.json()) as { password?: string }
  const appPassword = process.env.APP_PASSWORD
  const authToken = process.env.AUTH_TOKEN

  if (!appPassword || !authToken) {
    return NextResponse.json({ error: 'Auth not configured' }, { status: 500 })
  }
  if (password !== appPassword) {
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  const isHttps =
    req.headers.get('x-forwarded-proto') === 'https' ||
    req.nextUrl.protocol === 'https:'
  res.cookies.set('txnpipe_auth', authToken, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 90, // 90 days
    path: '/',
  })
  return res
}
