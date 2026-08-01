import type { Metadata, Viewport } from 'next'
import { Source_Serif_4 } from 'next/font/google'
import '@phosphor-icons/web/duotone'
import './globals.css'

// Source Serif 4 for everything — headings, body, UI chrome, numbers. No sans-serif anywhere.
const sourceSerif = Source_Serif_4({
  variable: '--font-source-serif',
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
})

export const metadata: Metadata = {
  title: 'TxnPipe',
  description: 'Snap a photo, pipe it to your spreadsheet',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'TxnPipe' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f3f2f2',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sourceSerif.variable} h-full`}>
      {/*
        A phone app first: the column is capped at a handset width and centred, so the
        20px side padding and 56px buttons stay the size they were drawn at instead of
        stretching across a desktop window.
      */}
      <body className="min-h-full bg-bg text-text">
        <div className="mx-auto w-full max-w-[430px]">{children}</div>
      </body>
    </html>
  )
}
