import { money, percent, rate } from '../lib/format'
import { Pill } from './ui'

/**
 * Headline figures.
 *
 * A single hairline grid rather than a row of floating cards: the
 * numbers are the content, so they get the weight and the chrome goes
 * away. Column count follows how many figures there are, not a
 * three-across template.
 */

function Metric({ label, value, hint, tone = 'text-ink', children }) {
  return (
    <div className="bg-surface px-4 py-3">
      <p className="label">{label}</p>
      {children ?? <p className={`num mt-1.5 text-xl font-semibold ${tone}`}>{value}</p>}
      {hint && <p className="mt-1 text-[11px] leading-4 text-ink-faint">{hint}</p>}
    </div>
  )
}

export default function ResultCards({ result }) {
  const forecast = result?.forecast || {}
  const decision = result?.decision || {}
  const chosen = result?.vessel_recommendation?.chosen || {}
  const mc = result?.monte_carlo || {}

  const confidence = typeof result?.confidence === 'number' ? result.confidence : null
  const risk = result?.risk?.overall_risk

  const riskTone =
    risk === 'LOW'
      ? 'border-positive text-positive'
      : risk === 'CRITICAL' || risk === 'HIGH'
        ? 'border-negative text-negative'
        : 'border-caution text-caution'

  const net = decision.net_expected_saving ?? 0

  return (
    <div className="rule grid grid-cols-2 gap-px border bg-rule md:grid-cols-3 xl:grid-cols-4">
      <Metric label="Rate today" value={rate(forecast.current_rate)} hint="per tonne, spot" />

      <Metric
        label={`Forecast, ${forecast.horizon_days ?? 14}d`}
        value={rate(forecast.expected)}
        hint={`Q10 ${rate(forecast.best)} / Q90 ${rate(forecast.worst)}`}
      />

      <Metric
        label="Expected saving"
        value={rate(decision.expected_saving)}
        tone={net >= 0 ? 'text-positive' : 'text-negative'}
        hint={`${rate(net)} net of waiting cost`}
      />

      <Metric
        label="Probability rates fall"
        value={
          mc.probability_rate_decrease === undefined ? '—' : percent(mc.probability_rate_decrease)
        }
        hint={mc.simulations ? `${mc.simulations.toLocaleString()} simulated paths` : ''}
      />

      <Metric label="Confidence" hint="width of the forecast band">
        <div className="mt-1.5 flex items-center gap-2">
          <span className="num text-xl font-semibold text-ink">
            {confidence === null ? '—' : percent(confidence)}
          </span>
          <span className="h-1 flex-1 bg-sunken">
            <span
              className="block h-full bg-navy"
              style={{ width: `${(confidence || 0) * 100}%` }}
            />
          </span>
        </div>
      </Metric>

      <Metric label="Risk" hint={`${result?.risk?.alert_count ?? 0} active warning(s)`}>
        <div className="mt-1.5">
          <Pill tone={riskTone}>{risk || '—'}</Pill>
        </div>
      </Metric>

      <Metric
        label="Recommended class"
        hint={
          chosen.cost_per_tonne_usd ? `${rate(chosen.cost_per_tonne_usd)} all-in per tonne` : ''
        }
      >
        <p className="mt-1.5 text-xl font-semibold text-ink">{chosen.vessel_type || '—'}</p>
      </Metric>

      <Metric
        label="Total landed cost"
        value={money(chosen.total_cost_usd)}
        hint={
          chosen.voyages_required
            ? `${chosen.voyages_required} voyage(s), ${chosen.tonnes_per_voyage?.toLocaleString()} t each`
            : 'freight, hire, bunkers, port charges'
        }
      />
    </div>
  )
}
