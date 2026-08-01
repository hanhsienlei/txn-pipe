'use client'

import { useEffect, useState, startTransition } from 'react'
import type { SheetInfo } from './sheets'

const CACHE_KEY = 'txnpipe_sheet_info'

/**
 * The spreadsheet's name, cached for the tab session.
 *
 * Every screen's dateline states which sheet it writes to, so this would otherwise be a
 * network round trip per navigation for a value that cannot change mid-session.
 *
 * The cache is read in the effect rather than as the initial state: sessionStorage does
 * not exist on the server, so seeding state from it during render makes the first client
 * render disagree with the server's HTML and React throws the whole tree away.
 */
export function useSheetInfo(): SheetInfo | null {
  const [info, setInfo] = useState<SheetInfo | null>(null)

  useEffect(() => {
    const cached = readCache()
    if (cached) {
      startTransition(() => setInfo(cached))
      return
    }

    let cancelled = false
    fetch('/api/sheets')
      .then((res) => (res.ok ? (res.json() as Promise<SheetInfo>) : null))
      .then((data) => {
        if (cancelled || !data?.title) return
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(data))
        setInfo(data)
      })
      .catch(() => {
        // The dateline simply stays quiet — it is context, never a blocker.
      })
    return () => {
      cancelled = true
    }
  }, [])

  return info
}

function readCache(): SheetInfo | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as SheetInfo) : null
  } catch {
    return null
  }
}

/** `https://docs.google.com/…#gid=0&range=A214` — the tab, scrolled to the first written row. */
export function sheetUrl(spreadsheetId: string, gid?: number, rowStart?: number): string {
  const base = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
  if (gid === undefined) return base
  const range = rowStart ? `&range=A${rowStart}` : ''
  return `${base}#gid=${gid}${range}`
}
