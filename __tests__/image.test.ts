import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  MAX_IMAGE_LONG_EDGE,
  needsDownscale,
  scaledSize,
  isSupportedMimeType,
} from '@/lib/image'

/** Width/height from a PNG's IHDR chunk — enough to check the golden set without an image library. */
function pngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path)
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

describe('needsDownscale', () => {
  it('leaves images at or under the long edge alone', () => {
    expect(needsDownscale(750, MAX_IMAGE_LONG_EDGE)).toBe(false)
    expect(needsDownscale(MAX_IMAGE_LONG_EDGE, 200)).toBe(false)
  })

  it('flags images over the long edge in either orientation', () => {
    expect(needsDownscale(3024, 4032)).toBe(true)
    expect(needsDownscale(4032, 3024)).toBe(true)
  })
})

describe('scaledSize', () => {
  it('is a no-op below the threshold', () => {
    expect(scaledSize(750, 1400)).toEqual({ width: 750, height: 1400 })
  })

  it('caps the long edge and preserves aspect ratio', () => {
    const { width, height } = scaledSize(3024, 4032)
    expect(height).toBe(MAX_IMAGE_LONG_EDGE)
    expect(width / height).toBeCloseTo(3024 / 4032, 2)
  })

  it('caps the long edge for landscape too', () => {
    expect(scaledSize(4032, 3024).width).toBe(MAX_IMAGE_LONG_EDGE)
  })
})

describe('isSupportedMimeType', () => {
  it('accepts what the API accepts and rejects HEIC', () => {
    expect(isSupportedMimeType('image/jpeg')).toBe(true)
    expect(isSupportedMimeType('image/png')).toBe(true)
    expect(isSupportedMimeType('image/heic')).toBe(false)
  })
})

// The eval harness sends golden images to the model as-is, while the app downscales first,
// so the two paths only describe the same thing while golden images are near the threshold.
// The current set is 750x1624 — a 3.4% shrink, i.e. a resampling difference rather than a
// resolution one. A real camera photo (4032px) would be a 2.6x reduction and the eval would
// stop describing production entirely; this test fails loudly if one is added.
// See docs/adr/0001-downscale-images-client-side.md.
const MAX_EVAL_DIVERGENCE = 0.95

describe('golden dataset', () => {
  const dir = join(process.cwd(), 'golden-dataset')
  const files = readdirSync(dir).filter((f) => f.endsWith('.png'))

  it('has cases to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files)('%s downscales by no more than a few percent', (file) => {
    const { width, height } = pngSize(join(dir, file))
    const scaled = scaledSize(width, height)
    expect(Math.max(scaled.width, scaled.height) / Math.max(width, height)).toBeGreaterThanOrEqual(
      MAX_EVAL_DIVERGENCE,
    )
  })
})
