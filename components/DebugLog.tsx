'use client'

import { useEffect, useState } from 'react'

// Simple global log bus — works even if console override is blocked
const listeners: Array<(line: string) => void> = []
export function dbg(...args: unknown[]) {
  const line = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
  listeners.forEach((fn) => fn(line))
}

export default function DebugLog() {
  const [lines, setLines] = useState<string[]>(['DebugLog mounted ✓'])

  useEffect(() => {
    function push(line: string) {
      setLines((prev) => [line, ...prev].slice(0, 40))
    }
    listeners.push(push)

    window.addEventListener('error', (ev) => push('ERR: ' + ev.message))
    window.addEventListener('unhandledrejection', (ev) => push('ERR: ' + String(ev.reason)))

    return () => {
      const i = listeners.indexOf(push)
      if (i !== -1) listeners.splice(i, 1)
    }
  }, [])

  return (
    <div className="fixed bottom-0 left-0 right-0 max-h-48 overflow-y-auto bg-black/90 text-green-400 text-xs p-2 font-mono z-50">
      <div className="text-neutral-500 mb-1">— debug log (v3) —</div>
      {lines.map((l, i) => (
        <div key={i} className={l.startsWith('ERR') ? 'text-red-400' : ''}>{l}</div>
      ))}
    </div>
  )
}
