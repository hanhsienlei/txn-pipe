/**
 * Number and date formatting for the broadsheet UI.
 *
 * Amounts are grouped with a narrow no-break space rather than a comma, and negatives use
 * a true minus sign (U+2212) rather than a hyphen — both are what make a column of
 * tabular figures read as a printed table instead of as code.
 */

const THIN_SPACE = ' '
const MINUS = '−'

const grouped = new Intl.NumberFormat('en-AU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const groupedWhole = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 })

/** `1234.5` → `1 234.50`. Always two decimals, never a sign. */
export function formatAmount(value: number): string {
  return grouped.format(Math.abs(value)).replace(/,/g, THIN_SPACE)
}

/** `1234.5` → `1 235`. For figures where cents are noise (six-month average). */
export function formatWhole(value: number): string {
  return groupedWhole.format(Math.abs(value)).replace(/,/g, THIN_SPACE)
}

/** `-88.4` → `−88.40`, `1924.01` → `+1 924.01`. Zero carries no sign. */
export function formatSigned(value: number): string {
  const body = formatAmount(value)
  if (value < 0) return `${MINUS}${body}`
  if (value > 0) return `+${body}`
  return body
}

/**
 * Entry dates are ISO `YYYY-MM-DD` today, but rows written before that are still
 * `YYYY/M/D`. Parse both, as a local (not UTC) date so a day never shifts on display.
 */
export function parseEntryDate(date: string): Date | null {
  const parts = date.split(/[-/]/)
  if (parts.length < 3) return null
  const [year, month, day] = parts.map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  const parsed = new Date(year, month - 1, day)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** The `YYYY-MM-DD` an `<input type="date">` wants, from either stored format. */
export function toDateInputValue(date: string): string {
  const parsed = parseEntryDate(date)
  if (!parsed) return ''
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${parsed.getFullYear()}-${month}-${day}`
}

// Spelled out rather than taken from `toLocaleDateString`, whose abbreviations differ by
// locale data — en-AU renders July as "July" and inserts a comma after the weekday, and
// Node and the browser don't always ship the same ICU tables. The design is exact here.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** `2026-07-12` → `12 Jul`. Falls back to the raw string if it won't parse. */
export function formatDayMonth(date: string): string {
  const parsed = parseEntryDate(date)
  if (!parsed) return date
  return `${String(parsed.getDate()).padStart(2, '0')} ${MONTHS[parsed.getMonth()]}`
}

/** `2026-07-12` → `Sun 12 Jul`, the History day header. */
export function formatDayHeader(date: string): string {
  const parsed = parseEntryDate(date)
  if (!parsed) return date
  return `${WEEKDAYS[parsed.getDay()]} ${formatDayMonth(date)}`
}

/** `14:07`, the Saved dateline. */
export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
