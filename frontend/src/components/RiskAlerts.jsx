import { SEVERITY_LABEL_TONE, SEVERITY_STYLES } from '../lib/format'
import { Panel, Pill } from './ui'

/**
 * PS 26006 requirement (d): early warnings for market volatility, port
 * congestion and other disruptions.
 *
 * The first prototype reduced this to one LOW/MEDIUM/HIGH label derived
 * from the forecast band, and never read the congestion signal that was
 * already in the dataset.
 */

const OVERALL_TONE = {
  CRITICAL: 'bg-red-200 text-negative',
  HIGH: 'bg-orange-200 text-caution',
  MEDIUM: 'bg-surface text-caution',
  LOW: 'bg-emerald-200 text-positive',
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
      right={
        <Pill tone={OVERALL_TONE[risk.overall_risk] || 'bg-slate-200 text-ink'}>
          {risk.overall_risk}
        </Pill>
      }
    >
      <ul className="space-y-3">
        {alerts.map((alert, index) => (
          <li
            key={`${alert.category}-${index}`}
            className={`border border-l-[3px] border-rule p-3.5 ${SEVERITY_STYLES[alert.severity] || 'border-l-rule-strong bg-surface'}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <strong
                className={`text-[13px] font-semibold ${SEVERITY_LABEL_TONE[alert.severity] || 'text-ink'}`}
              >
                {alert.title}
              </strong>
              <span className="label">{CATEGORY_LABEL[alert.category] || alert.category}</span>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-ink-muted">{alert.message}</p>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
