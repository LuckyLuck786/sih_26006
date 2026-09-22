import { percent } from '../lib/format'
import { Panel, Pill } from './ui'

/**
 * Model transparency panel.
 *
 * The problem statement asks for a "defensible" decision, so the
 * dashboard states how accurate the forecast actually is rather than
 * asking the user to take it on trust. The baseline comparison matters:
 * a freight forecaster that cannot beat "tomorrow equals today" is not
 * adding anything.
 */
export default function ModelCard({ model }) {
  const metrics = model?.metrics
  const importance = model?.feature_importance || []

  if (!metrics) return null

  const beatsNaive = metrics.improvement_vs_naive_pct > 0
  const coverage = metrics.interval_coverage_q10_q90

  const top = importance.slice(0, 8)
  const peak = Math.max(...top.map((f) => f.importance), 1)

  const PRETTY = {
    freight_rate: 'Current rate',
    freight_rate_rolling_mean_30: '30-day average rate',
    freight_rate_rolling_mean_14: '14-day average rate',
    freight_rate_rolling_mean_7: '7-day average rate',
    freight_rate_rolling_std_30: '30-day volatility',
    freight_rate_rolling_std_7: '7-day volatility',
    distance_nm: 'Voyage distance',
    season_sin: 'Seasonality',
    season_cos: 'Seasonality',
    congestion_rolling_mean_7: '7-day port congestion',
    congestion_lag_1: 'Port congestion',
    commodity_price: 'Commodity price',
    vessel_supply_lag_1: 'Open tonnage',
    rate_vs_mean_7: 'Rate momentum',
    freight_rate_change: 'Daily rate change',
  }

  return (
    <Panel
      eyebrow="Model transparency"
      title="Forecast accuracy"
      subtitle={`LightGBM quantile regression · ${metrics.rows_train?.toLocaleString()} training rows, ${metrics.features} features`}
      right={
        <Pill tone={beatsNaive ? 'bg-surface text-positive' : 'bg-surface text-caution'}>
          {beatsNaive
            ? `${metrics.improvement_vs_naive_pct}% better than naive`
            : 'At parity with naive'}
        </Pill>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="bg-sunken p-3.5">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink-muted">Model error</p>
          <p className="mt-1 text-xl font-black text-ink">${metrics.model_mae}/t</p>
          <p className="text-xs text-ink-faint">mean absolute error</p>
        </div>
        <div className="bg-sunken p-3.5">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink-muted">
            Naive baseline
          </p>
          <p className="mt-1 text-xl font-black text-ink-muted">${metrics.naive_mae}/t</p>
          <p className="text-xs text-ink-faint">&ldquo;tomorrow equals today&rdquo;</p>
        </div>
        <div className="bg-sunken p-3.5">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink-muted">
            Band coverage
          </p>
          <p className="mt-1 text-xl font-black text-ink">{percent(coverage)}</p>
          <p className="text-xs text-ink-faint">of actuals inside Q10–Q90 (target 80%)</p>
        </div>
      </div>

      {top.length > 0 && (
        <div className="mt-5 border-t border-rule pt-4">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink-muted">
            What drives the forecast
          </p>
          <ul className="mt-3 space-y-2">
            {top.map((feature) => (
              <li key={feature.feature} className="flex items-center gap-3">
                <span className="w-44 shrink-0 truncate text-xs text-ink-muted">
                  {PRETTY[feature.feature] || feature.feature}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-sunken">
                  <span
                    className="block h-full rounded-full bg-navy"
                    style={{ width: `${(feature.importance / peak) * 100}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs leading-5 text-ink-faint">
        Held-out test set from {metrics.cutoff_date} onward ({metrics.rows_test?.toLocaleString()}{' '}
        rows), split by date so the model never sees the future. Forecast horizon 14 days.
      </p>
    </Panel>
  )
}
