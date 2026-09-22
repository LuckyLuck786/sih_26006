import { rate, percent } from '../lib/format'
import { Panel, Stat, Pill } from './ui'

/**
 * PS 26006 requirement (a): optimal market entry timing.
 *
 * Driven by the Longstaff-Schwartz optimal-stopping model, which existed
 * in the original repository but was never imported by the pipeline or
 * surfaced anywhere in the UI.
 */
export default function OptimalTiming({ timing }) {
  if (!timing) return null

  const fixNow = timing.charter_now_is_optimal

  const distribution = timing.stopping_day_distribution || []
  const peak = Math.max(...distribution, 1)

  return (
    <Panel
      eyebrow="Requirement (a) · Market entry timing"
      title={timing.recommended_window}
      subtitle="Longstaff-Schwartz optimal stopping across simulated rate paths"
      right={
        <Pill tone={fixNow ? 'bg-surface text-caution' : 'bg-sunken text-teal-900'}>
          {timing.decision}
        </Pill>
      }
    >
      <div className="grid gap-5 sm:grid-cols-3">
        <Stat
          label="Waiting wins in"
          value={percent(timing.probability_waiting_wins)}
          hint={`of ${timing.simulations?.toLocaleString()} simulated markets`}
          tone={timing.probability_waiting_wins > 0.5 ? 'text-navy' : 'text-caution'}
        />
        <Stat
          label="Expected saving"
          value={rate(timing.expected_saving_per_tonne)}
          hint="per tonne, versus fixing today"
          tone={timing.expected_saving_per_tonne >= 0 ? 'text-positive' : 'text-negative'}
        />
        <Stat
          label="Typical fixing day"
          value={`Day ${timing.modal_stopping_day}`}
          hint={`mean ${timing.optimal_waiting_days} days`}
        />
      </div>

      {distribution.length > 1 && (
        <div className="mt-6">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink-muted">
            When the model chooses to fix
          </p>
          <div className="mt-3 flex items-end gap-1" style={{ height: 72 }}>
            {distribution.map((count, day) => {
              const isPeak = count === peak
              return (
                <div key={day} className="group relative flex flex-1 flex-col justify-end">
                  <div
                    className={`w-full transition ${isPeak ? 'bg-navy' : 'bg-sunken'}`}
                    style={{ height: `${Math.max((count / peak) * 100, 2)}%` }}
                    title={`Day ${day}: ${count} paths`}
                  />
                </div>
              )
            })}
          </div>
          <div className="mt-1 flex justify-between text-[10px] font-medium text-ink-faint">
            <span>Today</span>
            <span>Day {distribution.length - 1}</span>
          </div>
        </div>
      )}

      <p className="mt-5 bg-sunken p-3 text-xs leading-5 text-ink-muted">
        Each simulated market is replayed and the model asks, day by day, whether fixing now beats
        waiting another day and paying the carrying cost. Fixing today costs{' '}
        <strong>{rate(timing.cost_if_fixed_today)}</strong>; following the optimal waiting policy is
        expected to cost <strong>{rate(timing.expected_cost_if_waiting)}</strong>.
      </p>
    </Panel>
  )
}
