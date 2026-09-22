import { Pill } from './ui'

/**
 * The headline call.
 *
 * Carries one semantic colour on a single left rule rather than tinting
 * the whole surface, so the recommendation reads at a glance without the
 * panel turning into a coloured card.
 */
export default function DecisionBanner({ decision, reason, placeholder = false }) {
  const isWait = decision === 'WAIT'

  const accent = placeholder
    ? 'border-l-rule-strong'
    : isWait
      ? 'border-l-positive'
      : 'border-l-caution'

  const valueTone = placeholder ? 'text-ink-faint' : isWait ? 'text-positive' : 'text-caution'

  return (
    <section className={`rule border border-l-[3px] bg-surface px-5 py-4 ${accent}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label">Charter recommendation</p>
          <h2 className={`num mt-1 text-2xl font-semibold tracking-tight ${valueTone}`}>
            {decision || 'Awaiting input'}
          </h2>
        </div>
        {!placeholder && (
          <Pill tone={isWait ? 'border-positive text-positive' : 'border-caution text-caution'}>
            {isWait ? 'Monitor rates' : 'Secure capacity'}
          </Pill>
        )}
      </div>
      <p className="mt-2 max-w-3xl text-[13px] leading-6 text-ink-muted">
        {reason || 'Enter shipment details and run the analysis.'}
      </p>
    </section>
  )
}
