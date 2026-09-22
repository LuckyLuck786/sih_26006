import { useMemo } from 'react'

import { compareDestinations } from '../engine/compare'
import { inrCrore, inrRate } from '../lib/inr'
import { useFx } from '../lib/currency'
import { percent, rate, tonnes } from '../lib/format'
import { Panel, Pill } from './ui'

/**
 * The same parcel run against every East Coast discharge port.
 *
 * This is the clearest statement of what PS 26006 calls port
 * infrastructure limitation. One cargo into Gangavaram is a single
 * Capesize; the same cargo into Haldia is five part-laden Supramaxes at
 * roughly double the cost per tonne, because the draft and the berth
 * envelope decide the vessel and the vessel decides the cost.
 *
 * Every row is a full pipeline run, not an interpolation, so the numbers
 * match what the Decision tab would show for that port.
 */
export default function ScenarioCompare({ request }) {
  const fx = useFx()

  const comparison = useMemo(() => {
    if (!request) return null
    return compareDestinations({
      origin: request.origin,
      cargo_quantity: request.cargo_quantity,
      contract_duration: request.contract_duration_days,
    })
  }, [request])

  if (!comparison) return null

  const { runs, best, spread_usd: spread } = comparison

  return (
    <Panel
      eyebrow="Port comparison"
      title={`${request.cargo_quantity?.toLocaleString()} t from ${request.origin} to every East Coast port`}
      subtitle="One full pipeline run per port, ranked by all-in cost per tonne"
      right={
        spread ? (
          <Pill tone="border-positive text-positive">{inrCrore(spread, fx.rate)} spread</Pill>
        ) : null
      }
    >
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="rule border-b text-left">
              <th className="label py-2 pr-3">#</th>
              <th className="label py-2 pr-3">Discharge port</th>
              <th className="label py-2 pr-3">Draft</th>
              <th className="label py-2 pr-3">Class</th>
              <th className="label py-2 pr-3 text-right">All-in /t</th>
              <th className="label py-2 pr-3 text-right">Payload</th>
              <th className="label py-2 pr-3 text-right">Voyages</th>
              <th className="label py-2 pr-3 text-right">Idle</th>
              <th className="label py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              if (!run.ok) {
                return (
                  <tr key={run.destination} className="rule border-b">
                    <td className="py-2.5 pr-3 text-ink-faint">—</td>
                    <td className="py-2.5 pr-3 font-semibold text-ink">{run.destination}</td>
                    <td className="py-2.5 text-xs text-negative" colSpan={7}>
                      {run.reason}
                    </td>
                  </tr>
                )
              }

              const isBest = best && run.destination === best.destination
              const premium = best ? run.cost_per_tonne_usd / best.cost_per_tonne_usd - 1 : 0

              return (
                <tr key={run.destination} className={`rule border-b ${isBest ? 'bg-sunken' : ''}`}>
                  <td className="num py-2.5 pr-3 text-ink-faint">{run.rank}</td>

                  <td className="py-2.5 pr-3">
                    <span className="font-semibold text-ink">{run.destination}</span>
                    {isBest && (
                      <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-positive">
                        cheapest
                      </span>
                    )}
                    <span className="num block text-[11px] text-ink-faint">
                      {run.discharge_unlocode} · {run.distance_nm?.toLocaleString()} nm
                    </span>
                  </td>

                  <td className="num py-2.5 pr-3 text-ink-muted">
                    {run.max_draft ? `${run.max_draft} m` : '—'}
                  </td>

                  <td className="py-2.5 pr-3">
                    <span className="text-ink">{run.vessel_type}</span>
                    {run.rejected_classes.length > 0 && (
                      <span className="block text-[11px] text-ink-faint">
                        {run.rejected_classes.join(', ')} excluded
                      </span>
                    )}
                  </td>

                  <td className="num py-2.5 pr-3 text-right font-semibold text-ink">
                    {inrRate(run.cost_per_tonne_usd, fx.rate)}
                    <span className="block text-[10px] font-normal text-ink-faint">
                      {rate(run.cost_per_tonne_usd)}
                      {premium > 0.005 && (
                        <span className="text-caution"> +{percent(premium)}</span>
                      )}
                    </span>
                  </td>

                  <td className="num py-2.5 pr-3 text-right text-ink-muted">
                    {tonnes(run.max_payload_tonnes)}
                    <span className="block text-[10px] text-ink-faint">
                      {percent(run.payload_utilisation)} used
                    </span>
                  </td>

                  <td className="num py-2.5 pr-3 text-right text-ink-muted">
                    {run.voyages_required}
                  </td>

                  <td className="num py-2.5 pr-3 text-right text-ink-muted">
                    {run.idle_days} d
                    <span className="block text-[10px] text-ink-faint">
                      {percent(run.idle_share)}
                    </span>
                  </td>

                  <td className="num py-2.5 text-right text-ink">
                    {inrCrore(run.total_cost_usd, fx.rate)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {best && spread ? (
        <p className="mt-4 bg-sunken p-3 text-xs leading-5 text-ink-muted">
          Routing this parcel to <strong className="text-ink">{best.destination}</strong> rather
          than the most expensive feasible port is worth{' '}
          <strong className="num text-ink">{inrCrore(spread, fx.rate)}</strong>. The difference is
          not the freight rate, which is close across these ports. It is draft: the deeper berth
          takes a larger class at full load, and cost per tonne falls with vessel size.
        </p>
      ) : null}
    </Panel>
  )
}
