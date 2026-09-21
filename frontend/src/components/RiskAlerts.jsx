import { Panel, Pill, SEVERITY_STYLES } from './ui'

/**
 * PS 26006 requirement (d): early warnings for market volatility, port
 * congestion and other disruptions.
 *
 * The first prototype reduced this to one LOW/MEDIUM/HIGH label derived
 * from the forecast band, and never read the congestion signal that was
 * already in the dataset.
 */

const OVERALL_TONE = {
  CRITICAL: 'bg-red-200 text-red-900',
  HIGH: 'bg-orange-200 text-orange-900',
  MEDIUM: 'bg-amber-200 text-amber-900',
  LOW: 'bg-emerald-200 text-emerald-900',
}

const CATEGORY_LABEL = {
  volatility: 'Market volatility',
  congestion: 'Port congestion',
  supply: 'Tonnage supply',
  decision: 'Decision quality',
  clear: 'All clear',
}

export default function RiskAlerts({ risk }) {
  if (!risk) return null

  const alerts = risk.alerts || []

  return (
    <Panel
      eyebrow="Requirement (d) · Risk mitigation"
      title={`${risk.alert_count || 0} active warning${risk.alert_count === 1 ? '' : 's'}`}
      subtitle="Volatility, congestion, supply and decision fragility"
      right={<Pill tone={OVERALL_TONE[risk.overall_risk] || 'bg-slate-200 text-slate-800'}>{risk.overall_risk}</Pill>}
    >
      <ul className="space-y-3">
        {alerts.map((alert, index) => (
          <li
            key={`${alert.category}-${index}`}
            className={`rounded-xl border p-3.5 ${SEVERITY_STYLES[alert.severity] || 'border-slate-200 bg-slate-50 text-slate-800'}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <strong className="text-sm font-bold">{alert.title}</strong>
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] opacity-70">
                {CATEGORY_LABEL[alert.category] || alert.category}
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-5 opacity-90">{alert.message}</p>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
