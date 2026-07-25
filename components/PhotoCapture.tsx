'use client'

import { dbg } from '@/components/DebugLog'

interface Props {
  onFiles: (files: File[]) => void
  busy?: boolean
  onError?: (msg: string) => void
}

/**
 * Picks the images for a batch. Gallery allows multi-select — that's the weekly
 * camera-roll cleanup. Camera stays single-shot because you can't take several photos in
 * one go anyway.
 */
export default function PhotoCapture({ onFiles, busy = false, onError }: Props) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return
    dbg('files:', files.length, files.map((f) => `${f.name} ${Math.round(f.size / 1024)}KB`).join(', '))
    onError?.('')
    onFiles(files)
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
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: 0,
    cursor: busy ? 'default' : 'pointer',
  }

  return (
    <div className="flex gap-3 w-full max-w-sm">
      <div style={{ position: 'relative', flex: 1 }}>
        <div style={{ ...btnBase, background: '#ffffff', color: '#000000' }}>Camera</div>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={busy}
          onChange={handleChange}
          style={overlayInput}
          aria-label="Take a photo"
        />
      </div>
      <div style={{ position: 'relative', flex: 1 }}>
        <div style={{ ...btnBase, background: '#27272a', color: '#ffffff' }}>Gallery</div>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={busy}
          onChange={handleChange}
          style={overlayInput}
          aria-label="Choose from gallery"
        />
      </div>
    </div>
  )
}
