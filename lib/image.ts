/**
 * Client-side image preparation for extraction.
 *
 * See docs/adr/0001-downscale-images-client-side.md. Images are shrunk to a 1568px long
 * edge before they reach the model: a full-resolution phone photo, base64'd into a JSON
 * body, blows past Vercel's ~4.5MB request cap, and the API downsizes to roughly this
 * long edge anyway — so bigger is bytes the model never sees.
 *
 * The *policy* (threshold, and the "does this need resizing?" test) is plain functions
 * with no DOM dependency, so tests and the eval harness can assert against it without a
 * Node image library. Only `prepareImage` touches the DOM.
 */

/** Long edge, in pixels, that images are resized down to. Images at or under this pass through. */
export const MAX_IMAGE_LONG_EDGE = 1568

const JPEG_QUALITY = 0.8

/** Media types the Anthropic API accepts. Anything else (HEIC, notably) must be re-encoded. */
const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export function isSupportedMimeType(mimeType: string): boolean {
  return SUPPORTED_MIME_TYPES.includes(mimeType)
}

export function needsDownscale(width: number, height: number): boolean {
  return Math.max(width, height) > MAX_IMAGE_LONG_EDGE
}

/** Dimensions after downscaling, preserving aspect ratio. Unchanged if already small enough. */
export function scaledSize(width: number, height: number): { width: number; height: number } {
  if (!needsDownscale(width, height)) return { width, height }
  const scale = MAX_IMAGE_LONG_EDGE / Math.max(width, height)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

export interface PreparedImage {
  blob: Blob
  mimeType: string
  width: number
  height: number
  /** SHA-256 of the prepared bytes — the identity used to spot a re-selected receipt. */
  hash: string
}

export async function hashBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))),
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}

/**
 * Decode, downscale if needed, and hash. An image that is already small enough *and* in a
 * type the API accepts is passed through untouched — re-encoding it would only lose
 * detail. HEIC and friends are always re-encoded regardless of size.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file)
  try {
    const { width, height } = scaledSize(bitmap.width, bitmap.height)
    const unchanged = width === bitmap.width && height === bitmap.height

    if (unchanged && isSupportedMimeType(file.type)) {
      return { blob: file, mimeType: file.type, width, height, hash: await hashBlob(file) }
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    ctx.drawImage(bitmap, 0, 0, width, height)

    const blob = await canvasToBlob(canvas)
    return { blob, mimeType: 'image/jpeg', width, height, hash: await hashBlob(blob) }
  } finally {
    bitmap.close()
  }
}

/** Base64 payload (no data-URL prefix), as `/api/extract` expects. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new Error('Could not read image: ' + String(reader.error)))
    reader.readAsDataURL(blob)
  })
}
