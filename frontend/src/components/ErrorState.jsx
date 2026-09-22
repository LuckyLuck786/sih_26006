export default function ErrorState({ message, onRetry }) {
  return (
    <div className="border border-l-[3px] border-rule border-l-negative bg-surface px-5 py-4">
      <p className="label">Analysis unavailable</p>
      <h2 className="mt-1 text-[15px] font-semibold text-ink">The forecast did not complete.</h2>
      <p className="mt-2 text-[13px] leading-6 text-ink-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 border border-navy bg-navy px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-white transition-colors hover:bg-navy-soft"
      >
        Retry analysis
      </button>
    </div>
  )
}
