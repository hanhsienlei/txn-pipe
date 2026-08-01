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
 *
 * Both inputs are transparent overlays on top of the visible buttons rather than inputs
 * triggered by a click handler: iOS only opens the picker for a genuine user gesture on
 * the input itself, and a synthesised `.click()` gets swallowed.
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

  return (
    <div className="flex flex-col gap-2.5" style={{ opacity: busy ? 0.5 : 1 }}>
      <div className="relative">
        <div className="btn btn-primary">
          <i className="ph-duotone ph-camera text-[22px]" aria-hidden />
          Take a photo
        </div>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={busy}
          onChange={handleChange}
          className="absolute inset-0 w-full h-full opacity-0"
          aria-label="Take a photo"
        />
      </div>

      <div className="relative">
        <div className="btn btn-outline min-h-[56px] text-[17px]">
          <i className="ph-duotone ph-images text-[22px]" aria-hidden />
          Choose from gallery
        </div>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={busy}
          onChange={handleChange}
          className="absolute inset-0 w-full h-full opacity-0"
          aria-label="Choose from gallery"
        />
      </div>
    </div>
  )
}
