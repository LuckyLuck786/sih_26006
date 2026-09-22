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
 * Severity is carried by the left rule and the label tone, never by a
 * filled background: a page of tinted cards stops reading as data. The
 * four levels stay distinguishable without introducing new hues.
 */
export const SEVERITY_STYLES = {
  critical: 'border-l-negative bg-surface',
  high: 'border-l-caution bg-surface',
  medium: 'border-l-rule-strong bg-surface',
  low: 'border-l-positive bg-surface',
  info: 'border-l-navy bg-surface',
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
