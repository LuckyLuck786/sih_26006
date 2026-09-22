/**
 * Layout primitives.
 *
 * Panels are bounded by a hairline rule, not a drop shadow, and their
 * heading sits in a tinted strip so the structure reads without any
 * colour. Formatting helpers live in `src/lib/format.js`.
 */

export function Panel({ eyebrow, title, subtitle, children, right, className = '' }) {
  const hasHeader = eyebrow || title || right

  return (
    <section className={`rule border bg-surface ${className}`}>
      {hasHeader && (
        <header className="rule flex flex-wrap items-start justify-between gap-3 border-b bg-sunken px-4 py-3">
          <div className="min-w-0">
            {eyebrow && <p className="label">{eyebrow}</p>}
            {title && (
              <h3 className="mt-1 text-[15px] font-semibold leading-tight text-ink">{title}</h3>
            )}
            {subtitle && <p className="mt-0.5 text-xs leading-5 text-ink-muted">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      <div className="px-4 py-4">{children}</div>
    </section>
  )
}

/**
 * A labelled figure. `value` is set in tabular mono by default because
 * almost every Stat in this product holds a number.
 */
export function Stat({ label, value, hint, tone = 'text-ink', mono = true }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${mono ? 'num' : ''} ${tone}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs leading-4 text-ink-faint">{hint}</p>}
    </div>
  )
}

/**
 * Status chip. Square, bordered, uppercase. No pill radius, no fill that
 * competes with the data.
 */
export function Pill({ children, tone = 'border-rule-strong text-ink-muted' }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${tone}`}
    >
      {children}
    </span>
  )
}

/** Key/value row for dense specification lists. */
export function Row({ label, value, tone = 'text-ink' }) {
  return (
    <div className="rule flex items-baseline justify-between gap-4 border-b py-1.5 last:border-b-0">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className={`num text-sm font-medium ${tone}`}>{value}</span>
    </div>
  )
}
