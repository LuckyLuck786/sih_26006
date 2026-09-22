import { money, percent, SEVERITY_DOT } from '../lib/format'
import { Panel, Stat, Pill } from './ui'

/**
 * PS 26006 requirement (c): idle scenario management.
 *
 * Absent entirely from the first prototype, even though ports.json
 * already carried the cargo handling rates this needs.
 */
export default function IdlePanel({ idle }) {
  if (!idle) return null

  const segments = [
    { label: 'Laden', value: idle.sea_days_laden, tone: 'bg-navy', earning: true },
    { label: 'Loading', value: idle.load_days, tone: 'bg-navy', earning: true },
    { label: 'Discharge', value: idle.discharge_days, tone: 'bg-navy-soft', earning: true },
    { label: 'Ballast', value: idle.ballast_days, tone: 'bg-ink-faint', earning: false },
    {
      label: 'Berth wait',
      value: (idle.load_berth_wait_days || 0) + (idle.discharge_berth_wait_days || 0),
      tone: 'bg-amber-400',
      earning: false,
    },
  ].filter((s) => s.value > 0)

  const total = idle.total_round_trip_days || 1

  return (
    <Panel
      eyebrow="Requirement (c) · Idle scenario management"
      title={`${idle.idle_days} idle days per round trip`}
      subtitle="Where the non-earning time goes, and what to do about it"
      right={
        <Pill
          tone={idle.idle_share > 0.45 ? 'bg-surface text-caution' : 'bg-surface text-positive'}
        >
          {percent(idle.idle_share)} non-earning
        </Pill>
      }
    >
      <div className="flex h-7 w-full overflow-hidden">
        {segments.map((segment) => (
          <div
            key={segment.label}
            className={`${segment.tone} flex items-center justify-center`}
            style={{ width: `${(segment.value / total) * 100}%` }}
            title={`${segment.label}: ${segment.value.toFixed(1)} days`}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((segment) => (
          <span
            key={segment.label}
            className="flex items-center gap-1.5 text-[11px] text-ink-muted"
          >
            <span className={`h-2.5 w-2.5 ${segment.tone}`} />
            {segment.label} {segment.value.toFixed(1)}d
            {!segment.earning && <span className="text-ink-faint">(idle)</span>}
          </span>
        ))}
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-3">
        <Stat
          label="Round trip"
          value={`${idle.total_round_trip_days} d`}
          hint="port to port and back"
        />
        <Stat
          label="Berth queue"
          value={`${idle.discharge_berth_wait_days} d`}
          hint="at the discharge port"
          tone={idle.discharge_berth_wait_days > 2 ? 'text-caution' : 'text-ink'}
        />
        <Stat
          label="Demurrage exposure"
          value={money(idle.demurrage_cost_usd)}
          hint={`${idle.demurrage_days} days beyond laytime`}
          tone={idle.demurrage_cost_usd > 0 ? 'text-negative' : 'text-positive'}
        />
      </div>

      {idle.recommendations?.length > 0 && (
        <ul className="mt-5 space-y-2 border-t border-rule pt-4">
          {idle.recommendations.map((item) => (
            <li key={item.type} className="flex gap-2.5 text-xs leading-5 text-ink">
              <span
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[item.severity] || 'bg-ink-faint'}`}
              />
              {item.message}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
