'use client'

export type TileState = 'queued' | 'reading' | 'done' | 'failed'

export interface ProgressTile {
  key: string
  previewUrl: string
  state: TileState
}

interface Props {
  headline: string
  done: number
  total: number
  tiles: ProgressTile[]
  /** Seconds remaining, if enough images have finished to estimate honestly. */
  secondsLeft?: number
}

/**
 * The waiting state: what is happening, how much is left, and that nothing has been
 * written yet.
 *
 * The bar is determinate and the tiles tick over one at a time, so a slow batch still
 * visibly moves — a single pulsing line of text gives you no way to tell a working
 * extraction from a hung one.
 */
export default function ExtractionProgress({ headline, done, total, tiles, secondsLeft }: Props) {
  const pct = total > 0 ? (done / total) * 100 : 0

  return (
    <div className="flex-1 flex flex-col justify-center gap-7 px-5 pb-[60px]">
      <div className="flex flex-col gap-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[30px] font-semibold tracking-[-0.015em]">{headline}</h2>
          <span className="text-xl tabular-nums shrink-0" role="status" aria-live="polite">
            {done} / {total}
          </span>
        </div>

        <div
          className="h-1.5 rounded-sharp bg-ink-14 overflow-hidden"
          role="progressbar"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={total}
        >
          <div
            className="h-full bg-accent transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        <p className="text-[15px] text-ink-70">
          {secondsLeft !== undefined && `About ${secondsLeft} second${secondsLeft === 1 ? '' : 's'} left. `}
          Nothing is written to your sheet until you&rsquo;ve checked it.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {tiles.map((tile) => (
          <div
            key={tile.key}
            className={`relative aspect-square overflow-hidden rounded-sharp bg-surface ${
              tile.state === 'reading' ? 'border-2 border-accent' : ''
            } ${tile.state === 'queued' ? 'opacity-45' : ''}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={tile.previewUrl} alt="" className="w-full h-full object-cover" />

            {tile.state === 'reading' && (
              <span className="absolute inset-0 flex items-center justify-center bg-bg/70 text-[11px] uppercase tracking-[0.08em] text-accent">
                reading
              </span>
            )}

            {tile.state === 'done' && (
              <span className="absolute top-1.5 right-1.5 w-[22px] h-[22px] rounded-full bg-accent text-white text-[13px] flex items-center justify-center">
                ✓
              </span>
            )}

            {tile.state === 'failed' && (
              <span className="absolute top-1.5 right-1.5 w-[22px] h-[22px] rounded-full bg-accent-2 text-white text-[13px] flex items-center justify-center">
                !
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
