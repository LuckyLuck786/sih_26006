/**
 * Shared presentation helpers.
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

export const tonnes = (value) =>
  blank(value) ? '—' : `${Number(value).toLocaleString('en-US')} t`

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

export function Panel({ eyebrow, title, subtitle, children, right, className = '' }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {(eyebrow || title || right) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {eyebrow && (
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">{eyebrow}</p>
            )}
            {title && <h3 className="font-display mt-1 text-lg font-bold text-slate-900">{title}</h3>}
            {subtitle && <p className="mt-1 text-sm leading-5 text-slate-500">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, hint, tone = 'text-slate-900' }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-black ${tone}`}>{value}</p>
      {hint && <p className="mt-1 text-xs leading-4 text-slate-400">{hint}</p>}
    </div>
  )
}

export function Pill({ children, tone = 'bg-slate-100 text-slate-700' }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{children}</span>
  )
}
