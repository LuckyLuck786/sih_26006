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

/*
 * Severity tokens.
 *
 * Severity is carried by a bordered chip and the title tone, never by a
 * filled background or a coloured left stripe: tinted cards stop reading
 * as data, and the stripe is its own cliche.
 */
export const SEVERITY_PILL = {
  critical: 'border-negative text-negative',
  high: 'border-caution text-caution',
  medium: 'border-rule-strong text-ink-muted',
  low: 'border-positive text-positive',
  info: 'border-navy text-navy',
}

export const SEVERITY_LABEL_TONE = {
  critical: 'text-negative',
  high: 'text-caution',
  medium: 'text-ink',
  low: 'text-positive',
  info: 'text-navy',
}

export const SEVERITY_DOT = {
  critical: 'bg-negative',
  high: 'bg-caution',
  medium: 'bg-rule-strong',
  low: 'bg-positive',
  info: 'bg-navy',
}
