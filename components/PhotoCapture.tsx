'use client'

import { useState } from 'react'
import { dbg } from '@/components/DebugLog'

interface Props {
  onCapture: (base64: string, mimeType: string) => void
  loading?: boolean
  onError?: (msg: string) => void
}

function readAsBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    const timeout = setTimeout(() => reject(new Error('FileReader timeout after 15s')), 15000)
    reader.onload = (e) => {
      clearTimeout(timeout)
      const dataUrl = e.target?.result as string
      const comma = dataUrl.indexOf(',')
      const header = dataUrl.slice(0, comma)
      const base64 = dataUrl.slice(comma + 1)
      const mimeType = header.replace('data:', '').replace(';base64', '')
      resolve({ base64, mimeType })
    }
    reader.onerror = () => {
      clearTimeout(timeout)
      reject(new Error('FileReader error: ' + String(reader.error)))
    }
    reader.readAsDataURL(file)
  })
}

type Step = 'idle' | 'reading' | 'sending'

export default function PhotoCapture({ onCapture, loading = false, onError }: Props) {
  const [preview, setPreview] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('idle')
  const [status, setStatus] = useState('tap a button')
  const busy = loading || step !== 'idle'

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) { setStatus('no file'); return }
    setStatus('got: ' + file.name)
    dbg('file:', file.name, Math.round(file.size / 1024) + 'KB', file.type)
    try {
      setStep('reading')
      setPreview(URL.createObjectURL(file))
      setStatus('reading…')
      const { base64, mimeType } = await readAsBase64(file)
      dbg('read ok, mime:', mimeType)
      setStatus('sending…')
      setStep('sending')
      onCapture(base64, mimeType)
    } catch (err) {
      setStep('idle')
      const msg = err instanceof Error ? err.message : 'Could not read image'
      setStatus('ERR: ' + msg)
      dbg('ERR:', msg)
      onError?.(msg)
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Selected"
          className="w-full max-w-sm rounded-xl object-contain max-h-72 border border-neutral-200" />
      )}

      <div style={{ display: 'flex', gap: 12, width: '100%', maxWidth: 384 }}>
        <input type="file" accept="image/*" capture="environment"
          disabled={busy} onChange={handleChange}
          style={{ flex: 1, padding: '12px 0', borderRadius: 12, fontSize: 16,
            fontWeight: 600, cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.5 : 1, background: '#000', color: '#fff', border: 'none' }}
        />
        <input type="file" accept="image/*"
          disabled={busy} onChange={handleChange}
          style={{ flex: 1, padding: '12px 0', borderRadius: 12, fontSize: 16,
            fontWeight: 600, cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.5 : 1, background: '#f5f5f5', color: '#000', border: '1px solid #d4d4d4' }}
        />
      </div>

      <p style={{ fontSize: 12, fontFamily: 'monospace', color: '#2563eb', wordBreak: 'break-all' }}>{status}</p>

      {busy && (
        <p className="text-sm text-neutral-500 animate-pulse">
          {step === 'reading' ? 'Reading…' : 'Extracting data…'}
        </p>
      )}
    </div>
  )
}
