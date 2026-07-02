/**
 * Eval harness: runs extraction against the golden dataset and reports field-level
 * accuracy, average fields wrong per receipt, cost per receipt, and p50/p95 latency.
 *
 * Usage:
 *   npm run eval                      # run and print a report
 *   npm run eval -- --out evals/baseline.json   # also write the report as JSON
 *
 * Requires ANTHROPIC_API_KEY (loaded from .env if present).
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { scoreReceipt, aggregate, type ReceiptScore } from '../lib/scoring'
import type { Entry } from '../types/transaction'
import type { extractFromImageDetailed as ExtractFn } from '../lib/claude'

// Sonnet 4.6 pricing, USD per million tokens (see the claude-api model table).
const PRICE_INPUT_PER_MTOK = 3.0
const PRICE_OUTPUT_PER_MTOK = 15.0

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..')
const GOLDEN_DIR = join(ROOT, 'golden-dataset')

interface GoldenCase {
  id: string
  image: string
  expected: Entry[]
}

interface RunRecord {
  id: string
  accuracy: number
  wrongFields: number
  totalFields: number
  latencyMs: number
  costUsd: number
  inputTokens: number
  outputTokens: number
  error?: string
}

/** Minimal .env loader — only pulls ANTHROPIC_API_KEY so multi-line JSON values can't trip us up. */
function loadApiKey(): void {
  if (process.env.ANTHROPIC_API_KEY) return
  const envPath = join(ROOT, '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*ANTHROPIC_API_KEY\s*=\s*(.+)\s*$/)
    if (match) {
      process.env.ANTHROPIC_API_KEY = match[1].trim().replace(/^["']|["']$/g, '')
      return
    }
  }
}

function loadGoldenCases(): GoldenCase[] {
  return readdirSync(GOLDEN_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => {
      const id = file.replace(/\.json$/, '')
      const raw = JSON.parse(readFileSync(join(GOLDEN_DIR, file), 'utf8')) as {
        image: string
        expected: Entry[]
      }
      return { id, image: raw.image, expected: raw.expected }
    })
}

function mimeTypeFor(path: string): string {
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'
  if (path.endsWith('.webp')) return 'image/webp'
  if (path.endsWith('.gif')) return 'image/gif'
  return 'image/png'
}

function costOf(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * PRICE_INPUT_PER_MTOK +
    (outputTokens / 1_000_000) * PRICE_OUTPUT_PER_MTOK
  )
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[idx]
}

async function main() {
  loadApiKey()
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set (checked env and .env).')
    process.exit(1)
  }

  // Import after the key is in the environment — the Anthropic client reads it at construction.
  const { extractFromImageDetailed } = (await import('../lib/claude')) as {
    extractFromImageDetailed: typeof ExtractFn
  }

  const outFlagIdx = process.argv.indexOf('--out')
  const outPath = outFlagIdx !== -1 ? process.argv[outFlagIdx + 1] : undefined

  const cases = loadGoldenCases()
  console.log(`Running eval over ${cases.length} golden receipts...\n`)

  const scores: ReceiptScore[] = []
  const runs: RunRecord[] = []

  for (const c of cases) {
    const imagePath = join(ROOT, c.image)
    const base64 = readFileSync(imagePath).toString('base64')
    const start = Date.now()
    try {
      const { entries, usage } = await extractFromImageDetailed(base64, mimeTypeFor(c.image))
      const latencyMs = Date.now() - start
      const score = scoreReceipt(c.id, c.expected, entries)
      scores.push(score)
      const cost = costOf(usage.input_tokens, usage.output_tokens)
      runs.push({
        id: c.id,
        accuracy: score.accuracy,
        wrongFields: score.wrongFields,
        totalFields: score.totalFields,
        latencyMs,
        costUsd: cost,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
      })
      console.log(
        `  ${c.id}  acc ${(score.accuracy * 100).toFixed(0).padStart(3)}%  ` +
          `wrong ${score.wrongFields}/${score.totalFields}  ${latencyMs}ms  $${cost.toFixed(5)}`
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      runs.push({
        id: c.id,
        accuracy: 0,
        wrongFields: 0,
        totalFields: 0,
        latencyMs: Date.now() - start,
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        error: message,
      })
      console.log(`  ${c.id}  ERROR: ${message}`)
    }
  }

  const agg = aggregate(scores)
  const latencies = runs
    .filter((r) => !r.error)
    .map((r) => r.latencyMs)
    .sort((a, b) => a - b)
  const costs = runs.map((r) => r.costUsd)
  const avgCost = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : 0

  const report = {
    generatedAt: new Date().toISOString(),
    model: 'claude-sonnet-4-6',
    receipts: cases.length,
    errors: runs.filter((r) => r.error).length,
    fieldAccuracy: agg.fieldAccuracy,
    avgFieldsWrongPerReceipt: agg.avgFieldsWrongPerReceipt,
    avgCostUsd: avgCost,
    latencyMs: { p50: percentile(latencies, 50), p95: percentile(latencies, 95) },
    perField: agg.perField,
    runs,
  }

  console.log('\n─── Summary ──────────────────────────────')
  console.log(`  Field accuracy:            ${(agg.fieldAccuracy * 100).toFixed(1)}%`)
  console.log(`  Avg fields wrong/receipt:  ${agg.avgFieldsWrongPerReceipt.toFixed(2)}`)
  console.log(`  Avg cost/receipt:          $${avgCost.toFixed(5)}`)
  console.log(`  Latency p50 / p95:         ${report.latencyMs.p50}ms / ${report.latencyMs.p95}ms`)
  console.log(`  Errors:                    ${report.errors}`)
  console.log('\n  Per-field accuracy:')
  for (const [field, s] of Object.entries(agg.perField)) {
    console.log(
      `    ${field.padEnd(10)} ${(s.accuracy * 100).toFixed(0).padStart(3)}%  (${s.correct}/${s.total})`
    )
  }

  if (outPath) {
    const abs = resolve(ROOT, outPath)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, JSON.stringify(report, null, 2))
    console.log(`\nWrote report to ${outPath}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
