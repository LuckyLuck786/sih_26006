/**
 * Formatting helpers and severity tokens.
 *
 * Kept out of the component module so that file exports components only:
 * mixing components and constants in one file breaks React Fast Refresh.
 *
 * Freight rates in this system are US dollars per tonne, which is how the
 * dry-bulk market quotes. The first prototype formatted every figure as
 * INR, which mislabelled the model's own output.
 */

const usd0 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const usd2 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const blank = (value) => value === undefined || value === null || Number.isNaN(Number(value))

/** Whole dollars, for totals. */
export const money = (value) => (blank(value) ? '—' : usd0.format(Number(value)))

/** Dollars and cents, for per-tonne rates. */
export const rate = (value) => (blank(value) ? '—' : usd2.format(Number(value)))

export const tonnes = (value) => (blank(value) ? '—' : `${Number(value).toLocaleString('en-US')} t`)

export const days = (value) => (blank(value) ? '—' : `${Number(value).toFixed(1)} d`)

export const percent = (value, dp = 0) =>
  blank(value) ? '—' : `${(Number(value) * 100).toFixed(dp)}%`

export const SEVERITY_STYLES = {
  critical: 'border-red-300 bg-red-50 text-red-900',
  high: 'border-orange-300 bg-orange-50 text-orange-900',
  medium: 'border-amber-300 bg-amber-50 text-amber-900',
  low: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  info: 'border-sky-300 bg-sky-50 text-sky-900',
}

export const SEVERITY_DOT = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-amber-500',
  low: 'bg-emerald-500',
  info: 'bg-sky-500',
}
