import { money, rate, percent, Pill } from './ui'

function Card({ label, children }) {
  return (
    <article className="min-h-28 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <div className="mt-3">{children}</div>
    </article>
  )
}

export default function ResultCards({ result }) {
  const forecast = result?.forecast || {}
  const decision = result?.decision || {}
  const chosen = result?.vessel_recommendation?.chosen || {}
  const mc = result?.monte_carlo || {}

  const confidence = typeof result?.confidence === 'number' ? result.confidence : null
  const risk = result?.risk?.overall_risk || '—'

  const riskTone =
    risk === 'LOW'
      ? 'bg-emerald-100 text-emerald-800'
      : risk === 'CRITICAL'
        ? 'bg-red-100 text-red-800'
        : risk === 'HIGH'
          ? 'bg-orange-100 text-orange-800'
          : 'bg-amber-100 text-amber-800'

  const net = decision.net_expected_saving ?? 0

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Card label="Forecast range (per tonne)">
        <div className="flex items-end justify-between gap-2">
          <span className="text-xs text-slate-500">
            Best
            <br />
            <strong className="text-sm text-slate-700">{rate(forecast.best)}</strong>
          </span>
          <strong className="text-2xl font-black text-slate-900">{rate(forecast.expected)}</strong>
          <span className="text-right text-xs text-slate-500">
            Worst
            <br />
            <strong className="text-sm text-slate-700">{rate(forecast.worst)}</strong>
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Q10 / Q50 / Q90 at {forecast.horizon_days ?? 14} days
        </p>
      </Card>

      <Card label="Rate today">
        <strong className="text-2xl font-black text-slate-900">{rate(forecast.current_rate)}</strong>
        <p className="mt-2 text-xs text-slate-400">Per tonne, spot</p>
      </Card>

      <Card label="Expected saving by waiting">
        <div className={`text-2xl font-black ${net >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
          {rate(decision.expected_saving)}
        </div>
        <p className={`mt-2 text-xs font-semibold ${net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {rate(net)} net of waiting cost
        </p>
      </Card>

      <Card label="Confidence">
        <strong className="text-2xl font-black text-slate-900">
          {confidence === null ? '—' : percent(confidence)}
        </strong>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-teal-500 transition-all"
            style={{ width: `${(confidence || 0) * 100}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-400">Narrower forecast band means higher confidence</p>
      </Card>

      <Card label="Risk level">
        <Pill tone={riskTone}>{risk}</Pill>
        <p className="mt-3 text-xs text-slate-400">
          {result?.risk?.alert_count ? `${result.risk.alert_count} active warning(s)` : 'No active warnings'}
        </p>
      </Card>

      <Card label="Probability rates fall">
        <strong className="text-2xl font-black text-slate-900">
          {mc.probability_rate_decrease === undefined ? '—' : percent(mc.probability_rate_decrease)}
        </strong>
        <p className="mt-2 text-xs text-slate-400">
          {mc.simulations ? `${mc.simulations.toLocaleString()} Monte Carlo paths` : 'Simulation pending'}
        </p>
      </Card>

      <Card label="Recommended class">
        <strong className="block text-lg font-black text-slate-900">{chosen.vessel_type || '—'}</strong>
        <p className="mt-1 text-sm text-slate-500">
          {chosen.cost_per_tonne_usd ? `${rate(chosen.cost_per_tonne_usd)} all-in per tonne` : 'Pending'}
        </p>
      </Card>

      <Card label="Voyages required">
        <strong className="text-2xl font-black text-slate-900">{chosen.voyages_required ?? '—'}</strong>
        <p className="mt-2 text-xs text-slate-400">
          {chosen.tonnes_per_voyage ? `${chosen.tonnes_per_voyage.toLocaleString()} t per voyage` : ''}
        </p>
      </Card>

      <Card label="Total landed cost">
        <strong className="text-2xl font-black text-slate-900">{money(chosen.total_cost_usd)}</strong>
        <p className="mt-2 text-xs text-slate-400">Freight, hire, bunkers and port charges</p>
      </Card>
    </div>
  )
}
