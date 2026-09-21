export default function DecisionBanner({ decision, reason, placeholder = false }) {
  const isWait = decision === 'WAIT'
  return (
    <section
      className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${placeholder ? 'border-dashed border-slate-300 bg-white' : isWait ? 'border-teal-200 bg-teal-50' : 'border-amber-200 bg-amber-50'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">
            Charter recommendation
          </p>
          <h2
            className={`font-display mt-1 text-3xl font-black ${placeholder ? 'text-slate-400' : isWait ? 'text-teal-800' : 'text-amber-800'}`}
          >
            {decision || '—'}
          </h2>
        </div>
        {!placeholder && (
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${isWait ? 'bg-teal-200 text-teal-900' : 'bg-amber-200 text-amber-900'}`}
          >
            {isWait ? 'Monitor rates' : 'Secure capacity'}
          </span>
        )}
      </div>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
        {reason || 'Enter shipment details and click Analyze'}
      </p>
    </section>
  )
}
