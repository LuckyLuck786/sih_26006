/**
 * Skeleton, not a spinner.
 *
 * Renders the shape of the answer that is coming so the layout does not
 * jump when it arrives, and so the wait communicates what is being
 * computed rather than only that something is.
 */

function Block({ className = '' }) {
  return <div className={`skeleton ${className}`} />
}

export default function LoadingState() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Computing the charter decision</span>

      <div className="rule border bg-surface px-5 py-4">
        <Block className="h-2.5 w-32" />
        <Block className="mt-3 h-6 w-44" />
        <Block className="mt-3 h-3 w-full max-w-lg" />
      </div>

      <div className="rule grid grid-cols-2 gap-px border bg-rule sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="bg-surface px-4 py-3">
            <Block className="h-2 w-20" />
            <Block className="mt-2.5 h-5 w-24" />
          </div>
        ))}
      </div>

      <div className="rule border bg-surface">
        <div className="rule border-b bg-sunken px-4 py-3">
          <Block className="h-2.5 w-28" />
        </div>
        <div className="px-4 py-4">
          <Block className="h-48 w-full" />
        </div>
      </div>
    </div>
  )
}
