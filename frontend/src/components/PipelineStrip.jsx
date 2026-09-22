import { Panel, Pill } from './ui'

/**
 * Execution trace for the decision pipeline.
 *
 * Every stage, its measured duration and what it produced. The timings
 * come from `engine/trace.js` recording the engine as it ran, so this
 * reports work that happened rather than animating a fixed sequence. A
 * stage that is skipped or throws says so instead of silently passing.
 *
 * The same ten stages run in `ml/pipeline.py` on the Python side.
 */

const STATUS_TONE = {
  ok: 'border-positive text-positive',
  skipped: 'border-rule-strong text-ink-faint',
  failed: 'border-negative text-negative',
  'not-run': 'border-rule-strong text-ink-faint',
}

function formatMs(ms) {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1) return '<1 ms'
  return `${ms.toFixed(ms < 10 ? 1 : 0)} ms`
}

export default function PipelineStrip({ trace }) {
  if (!trace?.stages?.length) return null

  const slowest = Math.max(...trace.stages.map((s) => s.ms || 0), 0.01)
  const failed = trace.stages.filter((s) => s.status === 'failed').length

  return (
    <Panel
      eyebrow="Decision pipeline"
      title="Execution trace"
      subtitle="Ten stages, timed as the engine ran them in this browser"
      right={
        <Pill tone={failed ? 'border-negative text-negative' : 'border-positive text-positive'}>
          {failed ? `${failed} failed` : `${formatMs(trace.total_ms)} total`}
        </Pill>
      }
    >
      <ol className="rule grid grid-cols-1 gap-px border bg-rule sm:grid-cols-2 xl:grid-cols-5">
        {trace.stages.map((stage, index) => (
          <li key={stage.id} className="flex flex-col bg-surface px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="label">{String(index + 1).padStart(2, '0')}</span>
              <span
                className={`num text-[11px] font-medium ${
                  stage.status === 'ok' ? 'text-ink' : 'text-ink-faint'
                }`}
              >
                {formatMs(stage.ms)}
              </span>
            </div>

            <p className="mt-1 text-[13px] font-semibold leading-tight text-ink">{stage.label}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-ink-faint">{stage.detail}</p>

            {stage.note && (
              <p className="num mt-1.5 text-[11px] font-medium text-ink-muted">{stage.note}</p>
            )}

            {stage.error && <p className="mt-1.5 text-[11px] text-negative">{stage.error}</p>}

            {/* Share of the slowest stage, so the cost of the two
                simulation stages is visible against the rest. */}
            <span className="mt-2 block h-0.5 bg-sunken">
              <span
                className={`block h-full ${stage.status === 'ok' ? 'bg-navy' : 'bg-rule-strong'}`}
                style={{ width: `${Math.max(((stage.ms || 0) / slowest) * 100, 2)}%` }}
              />
            </span>

            <span className="mt-2">
              <Pill tone={STATUS_TONE[stage.status] || STATUS_TONE['not-run']}>{stage.status}</Pill>
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-3 text-[11px] leading-5 text-ink-faint">
        Optimal stopping and Monte Carlo dominate the budget: together they draw roughly 48,000 rate
        paths and run a backward induction with a least-squares regression at every step of the
        horizon. The same ten stages execute in <span className="num">ml/pipeline.py</span> when the
        FastAPI service is used instead.
      </p>
    </Panel>
  )
}
