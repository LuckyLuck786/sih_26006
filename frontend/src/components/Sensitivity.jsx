import { useMemo, useState } from 'react'

import { SWEEP_VARIABLES, sweep, sweepRange } from '../engine/compare'
import { inrRate } from '../lib/inr'
import { useFx } from '../lib/currency'
import { percent, rate } from '../lib/format'
import { Panel, Pill } from './ui'

/**
 * Where the recommendation changes.
 *
 * A point estimate tells a procurement team what to do today. It does
 * not tell them how fragile that is. Sweeping an input and reporting the
 * crossings answers the question they actually ask: at what parcel size
 * does this stop being worth waiting for, and at what carrying cost does
 * the answer flip.
 *
 * Every point is a full pipeline run rather than an interpolation,
 * because the decision is a threshold and the whole purpose is to locate
 * it exactly.
 */

const FIELD_LABEL = {
  decision: 'Charter call',
  timing: 'Entry timing',
  vessel_type: 'Vessel class',
  contract: 'Contract',
}

function formatValue(variable, value) {
  if (variable === 'cargo_quantity') return `${value.toLocaleString()} t`
  if (variable === 'contract_duration') return `${value} d`
  if (variable === 'annual_carrying_rate') return `${(value * 100).toFixed(0)}%`
  if (variable === 'cargo_value_per_ton') return `$${value.toLocaleString()}/t`
  return String(value)
}

export default function Sensitivity({ request }) {
  const fx = useFx()
  const [variable, setVariable] = useState('cargo_quantity')

  const base = useMemo(() => {
    if (!request) return null
    return {
      origin: request.origin,
      destination: request.destination,
      cargo_quantity: request.cargo_quantity,
      contract_duration: request.contract_duration_days,
    }
  }, [request])

  const result = useMemo(() => {
    if (!base) return null
    const current = base[variable] ?? request?.[variable]
    return sweep(base, variable, sweepRange(variable, current))
  }, [base, variable, request])

  if (!result) return null

  const feasible = result.points.filter((p) => p.ok)
  const savings = feasible.map((p) => p.net_expected_saving)
  const maxAbs = Math.max(...savings.map((s) => Math.abs(s)), 0.01)

  return (
    <Panel
      eyebrow="Sensitivity"
      title="Where the recommendation changes"
      subtitle={`${result.points.length} full pipeline runs across the range`}
      right={
        <Pill
          tone={
            result.crossings.length
              ? 'border-caution text-caution'
              : 'border-positive text-positive'
          }
        >
          {result.crossings.length
            ? `${result.crossings.length} crossing(s)`
            : 'stable across range'}
        </Pill>
      }
    >
      <div className="rule flex flex-wrap gap-px border bg-rule">
        {SWEEP_VARIABLES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setVariable(item.id)}
            aria-pressed={variable === item.id}
            className={`flex-1 px-3 py-1.5 text-xs font-semibold transition-colors ${
              variable === item.id
                ? 'bg-navy text-white'
                : 'bg-surface text-ink-muted hover:bg-sunken hover:text-ink'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="-mx-1 mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="rule border-b text-left">
              <th className="label py-2 pr-3">
                {SWEEP_VARIABLES.find((v) => v.id === variable)?.label}
              </th>
              <th className="label py-2 pr-3">Charter call</th>
              <th className="label py-2 pr-3">Timing</th>
              <th className="label py-2 pr-3">Class</th>
              <th className="label py-2 pr-3">Contract</th>
              <th className="label py-2 pr-3 text-right">All-in /t</th>
              <th className="label py-2 text-right">Net saving /t</th>
            </tr>
          </thead>
          <tbody>
            {result.points.map((point, index) => {
              if (!point.ok) {
                return (
                  <tr key={index} className="rule border-b">
                    <td className="num py-2 pr-3 text-ink">{formatValue(variable, point.value)}</td>
                    <td className="py-2 text-xs text-negative" colSpan={6}>
                      {point.reason}
                    </td>
                  </tr>
                )
              }

              const previous = result.points[index - 1]
              const flipped = previous?.ok && previous.decision !== point.decision
              const positive = point.net_expected_saving >= 0

              return (
                <tr key={index} className={`rule border-b ${flipped ? 'bg-sunken' : ''}`}>
                  <td className="num py-2 pr-3 font-medium text-ink">
                    {formatValue(variable, point.value)}
                  </td>

                  <td className="py-2 pr-3">
                    <span
                      className={`text-xs font-semibold ${
                        point.decision === 'WAIT' ? 'text-positive' : 'text-caution'
                      }`}
                    >
                      {point.decision}
                    </span>
                    {flipped && (
                      <span className="ml-2 text-[10px] uppercase tracking-[0.08em] text-caution">
                        flips
                      </span>
                    )}
                  </td>

                  <td className="py-2 pr-3 text-xs text-ink-muted">
                    {point.timing}
                    <span className="num block text-[10px] text-ink-faint">
                      {percent(point.probability_waiting_wins)} wait wins
                    </span>
                  </td>

                  <td className="py-2 pr-3 text-xs text-ink-muted">
                    {point.vessel_type}
                    <span className="num block text-[10px] text-ink-faint">
                      {point.voyages_required} voyage(s)
                    </span>
                  </td>

                  <td className="py-2 pr-3 text-xs text-ink-muted">{point.contract}</td>

                  <td className="num py-2 pr-3 text-right text-ink-muted">
                    {inrRate(point.cost_per_tonne_usd, fx.rate)}
                  </td>

                  <td className="py-2 text-right">
                    <span
                      className={`num text-xs font-medium ${
                        positive ? 'text-positive' : 'text-negative'
                      }`}
                    >
                      {rate(point.net_expected_saving)}
                    </span>
                    {/* Signed bar: waiting pays to the right, costs to the left. */}
                    <span className="mt-1 flex h-1 w-full items-center bg-sunken">
                      <span className="flex h-full w-1/2 justify-end">
                        {!positive && (
                          <span
                            className="block h-full bg-negative"
                            style={{
                              width: `${(Math.abs(point.net_expected_saving) / maxAbs) * 100}%`,
                            }}
                          />
                        )}
                      </span>
                      <span className="flex h-full w-1/2 justify-start">
                        {positive && (
                          <span
                            className="block h-full bg-positive"
                            style={{
                              width: `${(point.net_expected_saving / maxAbs) * 100}%`,
                            }}
                          />
                        )}
                      </span>
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {result.crossings.length > 0 ? (
        <ul className="mt-4 space-y-1.5 border-t border-rule pt-4">
          {result.crossings.map((crossing, index) => (
            <li key={index} className="text-xs leading-5 text-ink-muted">
              <strong className="text-ink">{FIELD_LABEL[crossing.field]}</strong> changes from{' '}
              <span className="num">{crossing.from}</span> to{' '}
              <span className="num">{crossing.to}</span> between{' '}
              <span className="num">{formatValue(variable, crossing.between[0])}</span> and{' '}
              <span className="num">{formatValue(variable, crossing.between[1])}</span>.
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 border-t border-rule pt-4 text-xs leading-5 text-ink-muted">
          No recommendation changes across this range. The call is not marginal on this input.
        </p>
      )}
    </Panel>
  )
}
