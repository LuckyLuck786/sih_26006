/**
 * Vessel-class optimisation — PS 26006 requirement (b).
 *
 * Mirrors `ml/decision/vessel_optimizer.py`. A draft restriction does not
 * exclude a vessel outright: real bulk carriers call at shallow ports
 * part-laden, which is what turns a yes/no check into a procurement
 * decision.
 */

import {
  BUNKER_PRICE_USD_PER_TONNE,
  LIGHTSHIP_DRAFT_RATIO,
  PORT_CHARGE_USD_PER_DWT,
  UNDER_KEEL_CLEARANCE_M,
} from './constants'
import { round } from './math'
import { VESSEL_CLASSES } from './reference'

export function draftLimitedPayload(dwt, summerDraft, availableDraft) {
  const usable = availableDraft - UNDER_KEEL_CLEARANCE_M
  const lightship = summerDraft * LIGHTSHIP_DRAFT_RATIO
  if (usable >= summerDraft) return dwt
  if (usable <= lightship) return 0
  return dwt * ((usable - lightship) / (summerDraft - lightship))
}

function assessClass(spec, loadPort, dischargePort, cargoQuantity, distanceNm, ratePerTonne) {
  const blockers = []

  for (const port of [loadPort, dischargePort]) {
    if (spec.LOA > port.max_LOA) {
      blockers.push(`LOA ${spec.LOA}m exceeds ${port.port} limit ${port.max_LOA}m`)
    }
    if (spec.beam > port.max_beam) {
      blockers.push(`Beam ${spec.beam}m exceeds ${port.port} limit ${port.max_beam}m`)
    }
  }

  const loadPayload = draftLimitedPayload(spec.dwt, spec.draft, loadPort.max_draft)
  const dischargePayload = draftLimitedPayload(spec.dwt, spec.draft, dischargePort.max_draft)
  const payload = Math.min(loadPayload, dischargePayload)

  const bindingPort = dischargePayload <= loadPayload ? dischargePort.port : loadPort.port

  if (payload <= 0) {
    blockers.push(`Draft at ${bindingPort} cannot float a ${spec.vessel_type} even in ballast`)
  }

  if (blockers.length) {
    return {
      vessel_type: spec.vessel_type,
      feasible: false,
      reasons: blockers,
      max_payload_tonnes: Math.round(Math.max(payload, 0)),
      dwt: spec.dwt,
    }
  }

  const voyages = Math.max(1, Math.ceil(cargoQuantity / payload))
  const perVoyage = cargoQuantity / voyages
  const utilisation = perVoyage / spec.dwt

  const seaDays = distanceNm / (spec.service_speed * 24)
  const loadDays = perVoyage / loadPort.cargo_handling_rate
  const dischargeDays = perVoyage / dischargePort.cargo_handling_rate
  const portDays = loadDays + dischargeDays
  const roundTripDays = seaDays * 2 + portDays

  const freightCost = ratePerTonne * cargoQuantity
  const hireCost = spec.daily_hire_usd * roundTripDays * voyages
  const bunkerCost = spec.bunker_tonnes_per_day * seaDays * 2 * voyages * BUNKER_PRICE_USD_PER_TONNE
  const portCharges = PORT_CHARGE_USD_PER_DWT * spec.dwt * voyages * 2

  const totalCost = freightCost + hireCost + bunkerCost + portCharges

  const notes = []
  if (utilisation < 0.6) {
    notes.push(
      `Only ${Math.round(utilisation * 100)}% of deadweight used. Parcel is small for this class`,
    )
  }
  if (payload < spec.dwt * 0.95) {
    notes.push(
      `Draft-limited at ${bindingPort} to ${Math.round(payload).toLocaleString()} t of ${spec.dwt.toLocaleString()} t capacity`,
    )
  }
  if (voyages > 1) notes.push(`Parcel requires ${voyages} voyages`)

  return {
    vessel_type: spec.vessel_type,
    feasible: true,
    reasons: [],
    notes,
    dwt: spec.dwt,
    max_payload_tonnes: Math.round(payload),
    binding_port: bindingPort,
    payload_utilisation: round(utilisation, 3),
    voyages_required: voyages,
    tonnes_per_voyage: Math.round(perVoyage),
    sea_days: round(seaDays, 1),
    port_days: round(portDays, 1),
    round_trip_days: round(roundTripDays, 1),
    freight_cost_usd: Math.round(freightCost),
    hire_cost_usd: Math.round(hireCost),
    bunker_cost_usd: Math.round(bunkerCost),
    port_charges_usd: Math.round(portCharges),
    total_cost_usd: Math.round(totalCost),
    cost_per_tonne_usd: round(totalCost / cargoQuantity, 2),
  }
}

export function rankVesselClasses(
  loadPort,
  dischargePort,
  cargoQuantity,
  distanceNm,
  ratesByClass,
) {
  const assessed = VESSEL_CLASSES.map((spec) =>
    assessClass(
      spec,
      loadPort,
      dischargePort,
      cargoQuantity,
      distanceNm,
      ratesByClass[spec.vessel_type] ?? ratesByClass.default ?? 0,
    ),
  )

  const feasible = assessed
    .filter((a) => a.feasible)
    .sort((a, b) => a.cost_per_tonne_usd - b.cost_per_tonne_usd)
  feasible.forEach((option, index) => {
    option.rank = index + 1
  })

  const rejected = assessed.filter((a) => !a.feasible)

  const savingVsNext =
    feasible.length >= 2
      ? Math.round(
          (feasible[1].cost_per_tonne_usd - feasible[0].cost_per_tonne_usd) * cargoQuantity,
        )
      : null

  return {
    recommended: feasible[0] || null,
    ranked: feasible,
    rejected,
    saving_vs_next_best_usd: savingVsNext,
  }
}
