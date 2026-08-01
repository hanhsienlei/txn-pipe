'use client'

import Link from 'next/link'

interface Props {
  /** Left of the dateline: where you are — `Capture`, `Check · 2 of 5`, `Saved 14:07`. */
  state: string
  /** Right of the dateline: where this is going — the sheet, or a warning. */
  destination?: string
  active?: 'history' | 'analytics'
  /** Extraction is uninterruptible: the nav dims and stops responding. */
  inert?: boolean
  /** Step rail, search field or month rail — whatever sits under the dateline. */
  children?: React.ReactNode
}

const navLinks = [
  { key: 'history', href: '/history', label: 'History' },
  { key: 'analytics', href: '/analytics', label: 'Analytics' },
] as const

/**
 * The masthead, identical on every screen.
 *
 * The thick-thin rule pair is what makes this read as front-page furniture rather than a
 * nav bar, and the dateline underneath means no screen ever leaves you guessing where you
 * are or which sheet you are writing to.
 */
export default function AppHeader({ state, destination, active, inert = false, children }: Props) {
  return (
    <header className="px-5 pt-[58px]">
      <div className="flex items-baseline justify-between gap-3">
        {inert ? (
          <span className="text-[21px] font-semibold tracking-[-0.02em]">TxnPipe</span>
        ) : (
          <Link href="/" className="text-[21px] font-semibold tracking-[-0.02em]">
            TxnPipe
          </Link>
        )}

        <nav className="flex gap-5 text-[15px]">
          {navLinks.map((link) =>
            inert ? (
              <span key={link.key} className="text-ink-35">
                {link.label}
              </span>
            ) : (
              <Link
                key={link.key}
                href={link.href}
                className={
                  active === link.key
                    ? 'text-accent font-semibold border-b-2 border-accent pb-px'
                    : 'text-ink-60'
                }
                aria-current={active === link.key ? 'page' : undefined}
              >
                {link.label}
              </Link>
            ),
          )}
        </nav>
      </div>

      <div className="h-[3px] bg-text mt-2.5" />
      <div className="h-px bg-text mt-0.5" />

      <div className="flex justify-between gap-3 pt-[7px]">
        <span className="eyebrow">{state}</span>
        {destination && <span className="eyebrow text-right">{destination}</span>}
      </div>

      {children}
    </header>
  )
}

/** One 4px bar per entry: done, current, pending. Visible before you scroll. */
export function StepRail({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex gap-1 pt-2.5" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`flex-1 h-1 ${
            i < current ? 'bg-text' : i === current ? 'bg-accent' : 'bg-ink-18'
          }`}
        />
      ))}
    </div>
  )
}
