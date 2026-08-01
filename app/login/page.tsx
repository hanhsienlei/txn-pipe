'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        router.replace('/')
      } else {
        setError('Wrong password')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex flex-col min-h-dvh">
      <header className="px-5 pt-[58px]">
        <span className="text-[21px] font-semibold tracking-[-0.02em]">TxnPipe</span>
        <div className="h-[3px] bg-text mt-2.5" />
        <div className="h-px bg-text mt-0.5" />
        <div className="pt-[7px]">
          <span className="eyebrow">Locked</span>
        </div>
      </header>

      <form
        onSubmit={handleSubmit}
        className="flex-1 flex flex-col justify-center gap-[30px] px-5 pb-[60px]"
      >
        <div className="flex flex-col gap-2.5">
          <h2 className="text-[34px] font-semibold leading-[1.1] tracking-[-0.015em]">
            Your ledger,
            <br />
            behind a door.
          </h2>
          <label className="flex flex-col gap-[3px] pt-2">
            <span className="eyebrow">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field-input text-[19px] min-h-11 border-b border-ink-30"
              autoFocus
              required
            />
          </label>
          {error && <p className="text-[15px] text-accent-2">{error}</p>}
        </div>

        <button type="submit" disabled={loading} className="btn btn-primary">
          {loading ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </main>
  )
}
