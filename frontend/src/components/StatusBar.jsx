import { MODEL_METRICS } from '../engine'
import { useFx } from '../lib/currency'

/**
 * Telemetry strip.
 *
 * Every value here is read from something real: the metrics written by
 * `ml/forecasting/train.py`, the reference data counts, the live FX
 * response, and the measured runtime of the last analysis. Nothing is a
 * decorative placeholder, and nothing is a version number invented to
 * look like a product.
 */

function Item({ label, value, tone = 'text-ink-muted' }) {
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="label">{label}</span>
      <span className={`num text-[11px] font-medium ${tone}`}>{value}</span>
    </div>
  )
}

export default function StatusBar({ trace, fleetSize, laneCount }) {
  const fx = useFx()
  const metrics = MODEL_METRICS?.metrics

  return (
    <div className="rule border-y bg-sunken">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-1.5 px-5 py-2 lg:px-8">
        <Item
          label="Engine"
          value={trace ? `ran ${trace.total_ms.toFixed(1)} ms` : 'idle'}
          tone={trace ? 'text-positive' : 'text-ink-faint'}
        />

        {metrics && (
          <>
            <Item label="Model" value={`LightGBM q10/q50/q90 · ${metrics.features}f`} />
            <Item
              label="MAE"
              value={`$${metrics.model_mae}/t · ${metrics.improvement_vs_naive_pct}% vs naive`}
              tone="text-positive"
            />
            <Item
              label="Coverage"
              value={`${(metrics.interval_coverage_q10_q90 * 100).toFixed(1)}%`}
            />
            <Item label="Trained" value={`${metrics.rows_train.toLocaleString()} rows`} />
            <Item label="Holdout" value={`from ${metrics.cutoff_date}`} />
          </>
        )}

        <Item label="Lanes" value={`${laneCount} · ${fleetSize} vessels`} />

        <Item
          label="FX"
          value={`${fx.rate.toFixed(2)} ${fx.stale ? 'pinned' : fx.date}`}
          tone={fx.stale ? 'text-caution' : 'text-ink-muted'}
        />
      </div>
    </div>
  )
}
