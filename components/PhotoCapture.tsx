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
  const busy = loading || step !== 'idle'

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    dbg('file:', file.name, Math.round(file.size / 1024) + 'KB', file.type)
    try {
      setStep('reading')
      setPreview(URL.createObjectURL(file))
      const { base64, mimeType } = await readAsBase64(file)
      dbg('read ok, mime:', mimeType)
      setStep('sending')
      onCapture(base64, mimeType)
    } catch (err) {
      setStep('idle')
      const msg = err instanceof Error ? err.message : 'Could not read image'
      dbg('ERR:', msg)
      onError?.(msg)
    }
  }

  const btnBase: React.CSSProperties = {
    padding: '14px 0',
    borderRadius: 14,
    fontSize: 15,
    fontWeight: 600,
    textAlign: 'center',
    opacity: busy ? 0.5 : 1,
    userSelect: 'none',
  }

  const overlayInput: React.CSSProperties = {
    position: 'absolute',
    top: 0, left: 0, width: '100%', height: '100%',
    opacity: 0,
    cursor: busy ? 'default' : 'pointer',
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Selected"
          className="w-full max-w-sm rounded-xl object-contain max-h-72 border border-neutral-700" />
      )}

      <div className="flex gap-3 w-full max-w-sm">
        <div style={{ position: 'relative', flex: 1 }}>
          <div style={{ ...btnBase, background: '#ffffff', color: '#000000' }}>Camera</div>
          <input type="file" accept="image/*" capture="environment"
            disabled={busy} onChange={handleChange} style={overlayInput} />
        </div>
        <div style={{ position: 'relative', flex: 1 }}>
          <div style={{ ...btnBase, background: '#27272a', color: '#ffffff' }}>Gallery</div>
          <input type="file" accept="image/*"
            disabled={busy} onChange={handleChange} style={overlayInput} />
        </div>
      </div>

      {busy && (
        <p className="text-sm text-neutral-400 animate-pulse">
          {step === 'reading' ? 'Reading…' : 'Extracting data…'}
        </p>
      )}
    </div>
  )
}
