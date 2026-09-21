/** Shared layout primitives. Formatting helpers live in `src/lib/format.js`. */

export function Panel({ eyebrow, title, subtitle, children, right, className = '' }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {(eyebrow || title || right) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {eyebrow && (
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">
                {eyebrow}
              </p>
            )}
            {title && (
              <h3 className="font-display mt-1 text-lg font-bold text-slate-900">{title}</h3>
            )}
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
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>
      {children}
    </span>
  )
}
