/**
 * Multi-run analysis: comparing lanes, and sweeping an input.
 *
 * Both work by calling the same orchestrator the single-shipment view
 * uses, so a comparison cannot drift from the primary result. A full run
 * costs roughly 34 ms, dominated by the two simulation stages, which is
 * cheap enough to run a dozen of them on a click.
 *
 * Sweeps deliberately re-run the whole pipeline per point rather than
 * interpolating: the charter decision is a threshold on net expected
 * saving, and the point of a sweep is to find exactly where that
 * threshold is crossed.
 */

import { analyzeShipmentLocal } from './index'
import { DESTINATIONS } from './reference'

/**
 * Run one parcel against several discharge ports.
 *
 * This is the clearest way to show what PS 26006 calls port
 * infrastructure limitation: the same cargo into Gangavaram and into
 * Haldia is a different vessel, a different number of voyages and
 * roughly double the cost per tonne.
 */
export function compareDestinations(payload, destinations = DESTINATIONS) {
  const runs = []

  for (const destination of destinations) {
    try {
      const result = analyzeShipmentLocal({ ...payload, destination })
      const chosen = result.vessel_recommendation.chosen

      runs.push({
        destination,
        ok: true,
        discharge_unlocode: result.route.discharge_port_unlocode,
        max_draft: result.route.discharge_port_max_draft ?? null,
        distance_nm: result.route.distance_nm,
        vessel_type: chosen.vessel_type,
        cost_per_tonne_usd: chosen.cost_per_tonne_usd,
        total_cost_usd: chosen.total_cost_usd,
        voyages_required: chosen.voyages_required,
        max_payload_tonnes: chosen.max_payload_tonnes,
        payload_utilisation: chosen.payload_utilisation,
        rejected_classes: result.vessel_recommendation.rejected.map((r) => r.vessel_type),
        idle_days: result.idle.idle_days,
        idle_share: result.idle.idle_share,
        demurrage_cost_usd: result.idle.demurrage_cost_usd,
        decision: result.decision.decision,
        risk: result.risk.overall_risk,
        contract: result.contract_strategy.recommendation,
      })
    } catch (error) {
      runs.push({ destination, ok: false, reason: error.message })
    }
  }

  const feasible = runs.filter((r) => r.ok)
  feasible.sort((a, b) => a.cost_per_tonne_usd - b.cost_per_tonne_usd)
  feasible.forEach((run, index) => {
    run.rank = index + 1
  })

  const best = feasible[0] || null
  const worst = feasible[feasible.length - 1] || null

  return {
    runs: [...feasible, ...runs.filter((r) => !r.ok)],
    best,
    worst,
    // What choosing the cheapest discharge port is worth on this parcel.
    spread_usd:
      best && worst
        ? Math.round(
            (worst.cost_per_tonne_usd - best.cost_per_tonne_usd) * (payload.cargo_quantity || 0),
          )
        : null,
  }
}

/**
 * Sweep one numeric input and report where the recommendation changes.
 *
 * `variable` is a key of the shipment payload. Returns a point per step
 * plus the crossings, which is the part that matters: a procurement team
 * wants to know the parcel size at which the answer stops being WAIT,
 * not a curve.
 */
export function sweep(payload, variable, values) {
  const points = []

  for (const value of values) {
    try {
      const result = analyzeShipmentLocal({ ...payload, [variable]: value })
      const chosen = result.vessel_recommendation.chosen

      points.push({
        value,
        ok: true,
        decision: result.decision.decision,
        net_expected_saving: result.decision.net_expected_saving,
        timing: result.optimal_timing.decision,
        probability_waiting_wins: result.optimal_timing.probability_waiting_wins,
        vessel_type: chosen.vessel_type,
        voyages_required: chosen.voyages_required,
        cost_per_tonne_usd: chosen.cost_per_tonne_usd,
        contract: result.contract_strategy.recommendation,
      })
    } catch (error) {
      points.push({ value, ok: false, reason: error.message })
    }
  }

  // A crossing is any step where a reported recommendation flips.
  const crossings = []
  const tracked = ['decision', 'timing', 'vessel_type', 'contract']

  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1]
    const current = points[i]
    if (!previous.ok || !current.ok) continue

    for (const field of tracked) {
      if (previous[field] !== current[field]) {
        crossings.push({
          field,
          from: previous[field],
          to: current[field],
          between: [previous.value, current.value],
        })
      }
    }
  }

  return { variable, points, crossings }
}

/** Sensible sweep ranges per input, so the UI does not have to guess. */
export function sweepRange(variable, current) {
  const base = Number(current) || 1

  if (variable === 'cargo_quantity') {
    return [10000, 25000, 50000, 75000, 100000, 150000, 200000, 300000, 450000]
  }

  if (variable === 'contract_duration') {
    return [15, 30, 45, 60, 90, 120, 180, 270, 365]
  }

  if (variable === 'annual_carrying_rate') {
    return [0.02, 0.04, 0.06, 0.08, 0.1, 0.14, 0.18, 0.24, 0.3]
  }

  if (variable === 'cargo_value_per_ton') {
    return [2000, 4000, 6000, 8000, 9500, 12000, 16000, 22000, 30000]
  }

  return [base * 0.5, base * 0.75, base, base * 1.5, base * 2]
}

export const SWEEP_VARIABLES = [
  { id: 'cargo_quantity', label: 'Cargo quantity', unit: 't' },
  { id: 'contract_duration', label: 'Contract duration', unit: 'd' },
  { id: 'annual_carrying_rate', label: 'Carrying rate', unit: '' },
  { id: 'cargo_value_per_ton', label: 'Cargo value', unit: '$/t' },
]
