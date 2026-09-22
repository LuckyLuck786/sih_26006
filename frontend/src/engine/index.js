/**
 * Browser-side charter decision engine.
 *
 * Mirrors the Python package in `ml/` so the deployed dashboard computes
 * a real decision with no backend. The forecast comes from the trained
 * LightGBM quantile models' exported output; everything downstream of it
 * runs live here, so cargo size, port pair and contract duration all
 * genuinely change the answer.
 *
 * Module map, Python -> JavaScript:
 *
 *   ml/decision/vessel_optimizer.py    -> ./vessels
 *   ml/decision/waiting_cost.py        -> ./timing
 *   ml/decision/charter_decision.py    -> ./timing
 *   ml/decision/monte_carlo.py         -> ./timing
 *   ml/decision/longstaff_schwartz.py  -> ./timing
 *   ml/decision/idle_management.py     -> ./idle
 *   ml/decision/contract_strategy.py   -> ./contracts
 *   ml/risk/alerts.py                  -> ./risk
 *
 * This file is the public surface: it orchestrates a single enquiry and
 * re-exports everything callers need, so no consumer reaches into a
 * submodule directly.
 */

import { compareSpotVsTerm } from './contracts'
import { analyseIdle } from './idle'
import { mean } from './math'
import {
  buildSeries,
  DESTINATIONS,
  FLEET,
  lookupForecast,
  MODEL_METRICS,
  ORIGINS,
  PORTS_BY_NAME,
  resolveRoute,
  VESSEL_CLASSES,
} from './reference'
import { buildRiskReport } from './risk'
import { charterDecision, monteCarlo, optimalStopping, waitingCost } from './timing'
import { rankVesselClasses } from './vessels'
import { createTrace } from './trace'

export { DESTINATIONS, MODEL_METRICS, ORIGINS, PORTS_BY_NAME, resolveRoute, VESSEL_CLASSES }
export { draftLimitedPayload, rankVesselClasses } from './vessels'
export { charterDecision, monteCarlo, optimalStopping, waitingCost } from './timing'
export { analyseIdle, estimateBerthWaitDays } from './idle'
export { compareSpotVsTerm, termPremiumFactor } from './contracts'
export { buildRiskReport } from './risk'
export { STAGES } from './trace'

export function analyzeShipmentLocal(payload) {
  const {
    origin,
    destination,
    cargo_quantity: cargoQuantity = 50000,
    contract_duration: contractDuration = 30,
    vessel_class: vesselClass = null,
    cargo_value_per_ton: cargoValuePerTon = 9500,
    annual_carrying_rate: annualCarryingRate = 0.08,
  } = payload

  const trace = createTrace()

  const route = trace.stage('route', () => resolveRoute(origin, destination))
  if (!route) throw new Error(`No route from ${origin} to ${destination}.`)

  const loadPort = PORTS_BY_NAME[route.origin]
  const dischargePort = PORTS_BY_NAME[route.destination]
  const originCountry = route.origin_country

  // Rate per tonne for each class, from the trained model's output.
  const ratesByClass = {}
  for (const spec of VESSEL_CLASSES) {
    const f = lookupForecast(originCountry, destination, spec.vessel_type)
    if (f) ratesByClass[spec.vessel_type] = f.expected
  }
  const rateValues = Object.values(ratesByClass)
  ratesByClass.default = rateValues.length ? mean(rateValues) : 0

  const vesselResult = trace.stage('vessel', () =>
    rankVesselClasses(loadPort, dischargePort, cargoQuantity, route.distance, ratesByClass),
  )

  let chosen = vesselResult.recommended
  let userChoiceInfeasible = null

  if (vesselClass) {
    const match = vesselResult.ranked.find((o) => o.vessel_type === vesselClass)
    if (match) chosen = match
    else
      userChoiceInfeasible =
        vesselResult.rejected.find((o) => o.vessel_type === vesselClass) || null
  }

  if (!chosen) {
    throw new Error(
      `No vessel class can physically serve ${loadPort.port} to ${dischargePort.port}.`,
    )
  }

  const forecast = trace.stage('forecast', () =>
    lookupForecast(originCountry, destination, chosen.vessel_type),
  )
  if (!forecast) throw new Error('No forecast available for this lane.')

  const horizonDays = forecast.horizon_days || 14
  const series = buildSeries(
    forecast.current_rate,
    forecast.expected,
    forecast.best,
    forecast.worst,
    horizonDays,
  )

  const wait = trace.stage('waiting', () =>
    waitingCost({ cargoQuantity, cargoValuePerTon, annualCarryingRate }),
  )
  const waitPerTonneDay = wait.waiting_cost_per_tonne_day
  const waitOverHorizon = waitPerTonneDay * horizonDays

  const decision = trace.stage('decision', () =>
    charterDecision(
      forecast.current_rate,
      forecast.best,
      forecast.expected,
      forecast.worst,
      waitOverHorizon,
    ),
  )

  const simulation = trace.stage('montecarlo', () =>
    monteCarlo(
      forecast.current_rate,
      forecast.best,
      forecast.expected,
      forecast.worst,
      waitOverHorizon,
    ),
  )

  const timing = trace.stage('stopping', () =>
    optimalStopping(
      forecast.current_rate,
      forecast.expected,
      forecast.best,
      forecast.worst,
      waitPerTonneDay,
      horizonDays,
    ),
  )

  const loadCongestion = Math.min(forecast.congestion * 1.1, 0.95)

  const idle = trace.stage('idle', () =>
    analyseIdle(
      chosen.vessel_type,
      chosen.tonnes_per_voyage,
      loadPort,
      dischargePort,
      chosen.sea_days,
      loadCongestion,
      forecast.congestion,
    ),
  )

  const contract = trace.stage('contract', () =>
    compareSpotVsTerm({
      series: series.map((p) => p.expected),
      cargoQuantity,
      contractDays: contractDuration,
      voyagesRequired: chosen.voyages_required,
      volatility: Math.max(forecast.volatility, forecast.current_rate * 0.03),
    }),
  )

  const openVessels = FLEET.filter(
    (v) =>
      v.location === loadPort.port &&
      v.status === 'available' &&
      v.vessel_type === chosen.vessel_type,
  )

  const risk = trace.stage('risk', () =>
    buildRiskReport({
      best: forecast.best,
      expected: forecast.expected,
      worst: forecast.worst,
      loadPort,
      dischargePort,
      loadCongestion,
      dischargeCongestion: forecast.congestion,
      vesselSupply: forecast.vessel_supply,
      availableVessels: openVessels.length,
      netExpectedSaving: decision.net_expected_saving,
      waitingCost: waitOverHorizon,
      probabilityWaitingWins: timing.probability_waiting_wins,
      recentVolatility: forecast.volatility,
    }),
  )

  trace.annotate('route', `${route.distance.toLocaleString()} nm`)
  trace.annotate('forecast', `${forecast.source === 'model' ? 'LightGBM' : 'fallback'}`)
  trace.annotate(
    'vessel',
    `${vesselResult.ranked.length} feasible, ${vesselResult.rejected.length} rejected`,
  )
  trace.annotate('montecarlo', `${simulation.simulations.toLocaleString()} paths`)
  trace.annotate('stopping', `${timing.simulations.toLocaleString()} paths x ${horizonDays}d`)
  trace.annotate('idle', `${idle.idle_days}d idle`)
  trace.annotate('contract', `${contract.recommendation}`)
  trace.annotate('risk', `${risk.alert_count} alert(s)`)
  trace.annotate('decision', decision.decision)
  trace.annotate('waiting', `$${wait.waiting_cost_per_tonne_day}/t/day`)

  return {
    trace: trace.summary(),
    request: {
      origin,
      origin_country: originCountry,
      destination,
      cargo_quantity: cargoQuantity,
      contract_duration_days: contractDuration,
    },
    route: {
      load_port: loadPort.port,
      load_port_unlocode: loadPort.unlocode,
      load_port_lat: loadPort.latitude,
      load_port_lon: loadPort.longitude,
      discharge_port: dischargePort.port,
      discharge_port_unlocode: dischargePort.unlocode,
      discharge_port_lat: dischargePort.latitude,
      discharge_port_lon: dischargePort.longitude,
      load_port_max_draft: loadPort.max_draft,
      discharge_port_max_draft: dischargePort.max_draft,
      distance_nm: route.distance,
    },
    forecast: {
      best: forecast.best,
      expected: forecast.expected,
      worst: forecast.worst,
      current_rate: forecast.current_rate,
      horizon_days: horizonDays,
      source: forecast.source,
      unit: 'USD per tonne',
    },
    forecast_series: series,
    decision: {
      ...decision,
      waiting_cost_per_tonne_day: waitPerTonneDay,
      waiting_cost_detail: wait,
    },
    confidence: decision.confidence,
    risk_level: decision.risk,
    optimal_timing: timing,
    monte_carlo: simulation,
    vessel_recommendation: {
      ...vesselResult,
      chosen,
      user_choice_infeasible: userChoiceInfeasible,
      open_vessels: openVessels,
    },
    idle,
    contract_strategy: contract,
    risk,
    model: MODEL_METRICS,
    fleet: FLEET,
  }
}
