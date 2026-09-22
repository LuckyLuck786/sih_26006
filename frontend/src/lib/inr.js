/**
 * Rupee formatting.
 *
 * Grouped the Indian way (lakh, crore) by the en-IN locale, so a total
 * reads 40,30,614 rather than 4,030,614. Kept apart from the FX context
 * so that file exports only a component and its hook.
 */

const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const inrPrecise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const blank = (value) => value === undefined || value === null || Number.isNaN(Number(value))

/** A USD total rendered in rupees, grouped in lakh and crore. */
export function inr(usd, rate) {
  if (blank(usd) || !Number.isFinite(rate)) return '—'
  return inrWhole.format(Number(usd) * rate)
}

/** A USD per-tonne rate rendered in rupees, to the paisa. */
export function inrRate(usd, rate) {
  if (blank(usd) || !Number.isFinite(rate)) return '—'
  return inrPrecise.format(Number(usd) * rate)
}

/**
 * Large totals in crore, which is how figures of this size are actually
 * spoken about in an Indian commercial meeting.
 */
export function inrCrore(usd, rate) {
  if (blank(usd) || !Number.isFinite(rate)) return '—'
  const rupees = Number(usd) * rate
  if (rupees < 1e7) return inrWhole.format(rupees)
  return `₹${(rupees / 1e7).toFixed(2)} cr`
}
