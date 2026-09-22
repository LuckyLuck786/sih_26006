/**
 * Masthead.
 *
 * Reads as a desk header: wordmark, mandate, and the reference data the
 * session is bound to. No glow, no badge, no gradient.
 */
export default function Header({ meta }) {
  return (
    <header className="border-b border-navy-soft bg-navy text-white">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-5 py-3 lg:px-8">
        <div className="flex items-baseline gap-3">
          <p className="text-[15px] font-semibold tracking-tight">Harborline</p>
          <span className="hidden h-3 w-px bg-white/25 sm:block" />
          <p className="hidden text-[11px] font-medium uppercase tracking-[0.16em] text-white/55 sm:block">
            Charter intelligence
          </p>
        </div>

        <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px]">
          {meta.map((item) => (
            <div key={item.label} className="flex items-baseline gap-1.5">
              <dt className="uppercase tracking-[0.08em] text-white/45">{item.label}</dt>
              <dd className="num font-medium text-white/90">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </header>
  )
}
