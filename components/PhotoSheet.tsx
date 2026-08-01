'use client'

import { useEffect, useRef } from 'react'
import { formatDayMonth } from '@/lib/format'

export interface PhotoChoice {
  key: string
  name: string
  previewUrl: string
  /** When this exact image was last written to the sheet, if it has been. */
  duplicateAt?: number
  selected: boolean
}

interface Props {
  photos: PhotoChoice[]
  onToggle: (key: string) => void
  onSelectAll: () => void
  onCancel: () => void
  onExtract: () => void
}

/**
 * Confirms which of the picked photos to extract.
 *
 * Anchored to the bottom of the viewport rather than centred in the page, so the primary
 * action is physically the last thing on the screen. Centring it meant a batch of a dozen
 * pushed the Extract button below the fold with nothing to say what to do next.
 */
export default function PhotoSheet({ photos, onToggle, onSelectAll, onCancel, onExtract }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    sheetRef.current?.focus()
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  const selected = photos.filter((photo) => photo.selected).length
  const duplicates = photos.filter((photo) => photo.duplicateAt !== undefined).length
  const allSelected = selected === photos.length

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onCancel}
        className="scrim absolute inset-0 w-full bg-[rgba(32,30,29,0.4)]"
      />

      <div
        ref={sheetRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`${photos.length} photos picked`}
        /* Centred with auto margins, not a transform — the slide-up keyframe animates
           `transform` and would otherwise cancel the centring for the whole animation. */
        className="sheet absolute inset-x-0 bottom-0 mx-auto w-full max-w-[430px] flex flex-col max-h-[660px] bg-bg"
      >
        <div className="flex justify-center pt-2.5 shrink-0">
          <div className="w-11 h-1 rounded-full bg-ink-25" />
        </div>

        <div className="flex items-baseline justify-between gap-3 px-5 pt-3.5 shrink-0">
          <h2 className="text-2xl font-semibold tracking-[-0.015em]">
            {photos.length} photo{photos.length === 1 ? '' : 's'} picked
          </h2>
          <button type="button" onClick={onSelectAll} className="text-[15px] text-accent shrink-0">
            {allSelected ? 'Select none' : 'Select all'}
          </button>
        </div>

        <p className="px-5 pt-1.5 text-[15px] text-ink-70 shrink-0">
          {selected} selected
          {duplicates > 0 && (
            <>
              {' · '}
              <span className="text-accent-2">
                {duplicates} already logged, tap to include anyway
              </span>
            </>
          )}
        </p>

        <div className="grid grid-cols-3 gap-2.5 px-5 pt-4 overflow-y-auto">
          {photos.map((photo) => {
            const duplicate = photo.duplicateAt !== undefined
            return (
              <button
                key={photo.key}
                type="button"
                onClick={() => onToggle(photo.key)}
                aria-pressed={photo.selected}
                aria-label={`${photo.name}${duplicate ? ', already logged' : ''}`}
                className={`relative aspect-square overflow-hidden rounded-sharp border-2 ${
                  photo.selected ? 'border-accent' : 'border-ink-16 opacity-50'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.previewUrl} alt="" className="w-full h-full object-cover" />

                {photo.selected && (
                  <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-accent text-white text-sm flex items-center justify-center">
                    ✓
                  </span>
                )}

                {duplicate && (
                  <span className="absolute inset-x-0 bottom-0 bg-accent-2 text-white text-[10px] text-center py-0.5">
                    Logged {formatDayMonth(new Date(photo.duplicateAt!).toISOString().slice(0, 10))}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex flex-col gap-2.5 px-5 pt-[22px] pb-11 shrink-0">
          <button
            type="button"
            onClick={onExtract}
            disabled={selected === 0}
            className="btn btn-primary"
          >
            Extract {selected} receipt{selected === 1 ? '' : 's'}
          </button>
          <button type="button" onClick={onCancel} className="btn btn-ghost">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
