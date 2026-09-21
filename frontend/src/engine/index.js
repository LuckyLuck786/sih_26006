/**
 * Browser-side charter decision engine.
 *
 * This mirrors the Python package in `ml/` so the deployed dashboard
 * computes a real decision without a backend. The forecast itself comes
 * from `data/forecasts.json`, which holds the trained LightGBM quantile
 * models' actual output for every lane and vessel class. Everything
 * downstream of the forecast runs live here against whatever the user
 * enters, so cargo size, port pair and contract duration all genuinely
 * change the answer.
 *
 * Module map, Python -> JavaScript:
 *
 *   ml/decision/vessel_optimizer.py    -> rankVesselClasses
 *   ml/decision/waiting_cost.py        -> waitingCost
 *   ml/decision/charter_decision.py    -> charterDecision
 *   ml/decision/monte_carlo.py         -> monteCarlo
 *   ml/decision/longstaff_schwartz.py  -> optimalStopping
 *   ml/decision/idle_management.py     -> analyseIdle
 *   ml/decision/contract_strategy.py   -> compareSpotVsTerm
 *   ml/risk/alerts.py                  -> buildRiskReport
 */

import forecasts from '../data/forecasts.json'
import ports from '../data/ports.json'
import vesselClasses from '../data/vessel_classes.json'
import routes from '../data/routes.json'
import fleet from '../data/vessels.json'
import modelMetrics from '../data/model_metrics.json'

// Shared with the Python side so both produce identical runs.
const SEED = 26006

const LIGHTSHIP_DRAFT_RATIO = 0.35
const UNDER_KEEL_CLEARANCE_M = 0.5
const BUNKER_PRICE_USD_PER_TONNE = 620
const PORT_CHARGE_USD_PER_DWT = 0.42
const CONGESTION_QUEUE_DAYS = 9

const DEMURRAGE_USD_PER_DAY = {
  Handysize: 8000,
  Supramax: 11000,
  Panamax: 14000,
  Capesize: 22000,
}

export const PORTS_BY_NAME = Object.fromEntries(ports.map((p) => [p.port, p]))

export const ORIGINS = [...new Set(ports.filter((p) => p.role === 'load').map((p) => p.country))].sort()

export const DESTINATIONS = ports.filter((p) => p.role === 'discharge').map((p) => p.port)

export const VESSEL_CLASSES = vesselClasses

export const MODEL_METRICS = modelMetrics

// ---------------------------------------------------------------
// Seeded randomness
//
// Math.random() would make every re-run of the same enquiry produce
// different probabilities, which is exactly the bug the Python Monte
// Carlo had before it was seeded.
// ---------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussianSampler(seed) {
  const rand = mulberry32(seed)
  let spare = null

  return function normal(mean = 0, sigma = 1) {
    if (spare !== null) {
      const value = spare
      spare = null
      return mean + sigma * value
    }
    let u = 0
    let v = 0
    let s = 0
    do {
      u = rand() * 2 - 1
      v = rand() * 2 - 1
      s = u * u + v * v
    } while (s === 0 || s >= 1)
    const factor = Math.sqrt((-2 * Math.log(s)) / s)
    spare = v * factor
    return mean + sigma * u * factor
  }
}

function percentile(sorted, p) {
  if (!sorted.length) return 0
  const index = (sorted.length - 1) * p
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

// ---------------------------------------------------------------
// Route resolution
// ---------------------------------------------------------------

export function resolveRoute(origin, destination) {
  const candidates = routes.filter(
    (r) => r.destination === destination && (r.origin === origin || r.origin_country === origin),
  )
  if (!candidates.length) return null
  return candidates.reduce((best, r) => (r.distance < best.distance ? r : best))
}

function lookupForecast(originCountry, destination, vesselType) {
  return (
    forecasts[`${originCountry}|${destination}|${vesselType}`] ||
    forecasts[`${originCountry}|${destination}|Panamax`] ||
    null
  )
}

/** Expand the horizon quantiles into a daily curve, as the Python service does. */
function buildSeries(currentRate, expected, best, worst, horizonDays) {
  const halfBandAtHorizon = Math.max((worst - best) / 2, 1e-9)
  const series = []
  for (let day = 0; day <= horizonDays; day += 1) {
    const progress = horizonDays ? day / horizonDays : 1
    const value = currentRate + (expected - currentRate) * progress
    const halfBand = halfBandAtHorizon * Math.sqrt(progress)
    series.push({
      day,
      expected: round(value, 2),
      lower: round(Math.max(value - halfBand, 0), 2),
      upper: round(value + halfBand, 2),
    })
  }
  return series
}

const round = (value, dp = 0) => {
  const factor = 10 ** dp
  return Math.round(value * factor) / factor
}

// ---------------------------------------------------------------
// (b) Vessel class optimisation
// ---------------------------------------------------------------

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
    notes.push(`Only ${Math.round(utilisation * 100)}% of deadweight used — parcel is small for this class`)
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

export function rankVesselClasses(loadPort, dischargePort, cargoQuantity, distanceNm, ratesByClass) {
  const assessed = vesselClasses.map((spec) =>
    assessClass(
      spec,
      loadPort,
      dischargePort,
      cargoQuantity,
      distanceNm,
      ratesByClass[spec.vessel_type] ?? ratesByClass.default ?? 0,
    ),
  )

  const feasible = assessed.filter((a) => a.feasible).sort((a, b) => a.cost_per_tonne_usd - b.cost_per_tonne_usd)
  feasible.forEach((option, index) => {
    option.rank = index + 1
  })

  const rejected = assessed.filter((a) => !a.feasible)

  const savingVsNext =
    feasible.length >= 2
      ? Math.round((feasible[1].cost_per_tonne_usd - feasible[0].cost_per_tonne_usd) * cargoQuantity)
      : null

  return { recommended: feasible[0] || null, ranked: feasible, rejected, saving_vs_next_best_usd: savingVsNext }
}

// ---------------------------------------------------------------
// Waiting cost and the charter/wait comparison
// ---------------------------------------------------------------

export function waitingCost({ cargoQuantity, cargoValuePerTon, annualCarryingRate, storagePerDay = 0, opsPerDay = 0 }) {
  const cargoValue = cargoQuantity * cargoValuePerTon
  const dailyCarrying = (cargoValue * annualCarryingRate) / 365
  const total = dailyCarrying + storagePerDay + opsPerDay
  return {
    cargo_value: round(cargoValue, 2),
    daily_carrying_cost: round(dailyCarrying, 2),
    waiting_cost_per_day: round(total, 2),
    waiting_cost_per_tonne_day: cargoQuantity ? round(total / cargoQuantity, 4) : 0,
  }
}

export function charterDecision(currentRate, best, expected, worst, waitCostOverHorizon) {
  const expectedSaving = currentRate - expected
  const netExpectedSaving = expectedSaving - waitCostOverHorizon
  const range = worst - best
  const uncertaintyPct = expected ? (range / expected) * 100 : 0

  const risk = uncertaintyPct < 10 ? 'LOW' : uncertaintyPct < 25 ? 'MEDIUM' : 'HIGH'
  const confidence = Math.max(0, Math.min(1, 1 - uncertaintyPct / 100))

  const wait = netExpectedSaving > 0

  return {
    decision: wait ? 'WAIT' : 'CHARTER NOW',
    current_rate: round(currentRate, 2),
    forecast: { best: round(best, 2), expected: round(expected, 2), worst: round(worst, 2) },
    best_case_saving: round(currentRate - best, 2),
    expected_saving: round(expectedSaving, 2),
    worst_case_loss: round(worst - currentRate, 2),
    waiting_cost: round(waitCostOverHorizon, 2),
    net_expected_saving: round(netExpectedSaving, 2),
    risk,
    confidence: round(confidence, 2),
    reason: wait
      ? 'Expected freight rate is lower than the current rate after accounting for waiting cost.'
      : 'Waiting does not provide enough expected savings after accounting for waiting cost.',
  }
}

// ---------------------------------------------------------------
// Monte Carlo
// ---------------------------------------------------------------

export function monteCarlo(currentRate, best, expected, worst, waitCost, simulations = 6000) {
  const normal = gaussianSampler(SEED)
  const lowerSpread = Math.max(expected - best, 1e-6)
  const upperSpread = Math.max(worst - expected, 1e-6)

  const futureRates = []
  const savings = []

  for (let i = 0; i < simulations; i += 1) {
    const z = normal(0, 1)
    const rate = Math.max(expected + z * (z < 0 ? lowerSpread : upperSpread), 0)
    futureRates.push(rate)
    savings.push(currentRate - rate - waitCost)
  }

  const sorted = [...futureRates].sort((a, b) => a - b)

  return {
    simulations,
    expected_future_rate: round(mean(futureRates), 2),
    simulated_q10: round(percentile(sorted, 0.1), 2),
    simulated_q50: round(percentile(sorted, 0.5), 2),
    simulated_q90: round(percentile(sorted, 0.9), 2),
    expected_saving: round(mean(savings), 2),
    probability_of_saving: round(savings.filter((s) => s > 0).length / simulations, 4),
    probability_rate_increase: round(futureRates.filter((r) => r > currentRate).length / simulations, 4),
    probability_rate_decrease: round(futureRates.filter((r) => r < currentRate).length / simulations, 4),
  }
}

// ---------------------------------------------------------------
// (a) Optimal market entry timing — Longstaff-Schwartz
// ---------------------------------------------------------------

function leastSquares3(x, y) {
  // Fit y = a + b*x + c*x^2 by normal equations.
  const n = x.length
  let s0 = n
  let s1 = 0
  let s2 = 0
  let s3 = 0
  let s4 = 0
  let t0 = 0
  let t1 = 0
  let t2 = 0

  for (let i = 0; i < n; i += 1) {
    const xi = x[i]
    const x2 = xi * xi
    s1 += xi
    s2 += x2
    s3 += x2 * xi
    s4 += x2 * x2
    t0 += y[i]
    t1 += xi * y[i]
    t2 += x2 * y[i]
  }

  const m = [
    [s0, s1, s2, t0],
    [s1, s2, s3, t1],
    [s2, s3, s4, t2],
  ]

  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < 3; col += 1) {
    let pivot = col
    for (let r = col + 1; r < 3; r += 1) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r
    }
    ;[m[col], m[pivot]] = [m[pivot], m[col]]
    if (Math.abs(m[col][col]) < 1e-12) return [mean(y), 0, 0]
    for (let r = col + 1; r < 3; r += 1) {
      const factor = m[r][col] / m[col][col]
      for (let c = col; c < 4; c += 1) m[r][c] -= factor * m[col][c]
    }
  }

  const out = [0, 0, 0]
  for (let r = 2; r >= 0; r -= 1) {
    let acc = m[r][3]
    for (let c = r + 1; c < 3; c += 1) acc -= m[r][c] * out[c]
    out[r] = acc / m[r][r]
  }
  return out
}

export function optimalStopping(currentRate, expected, best, worst, waitCostPerDay, horizonDays = 14, simulations = 3000) {
  const normal = gaussianSampler(SEED + 7)

  const horizonSigma = Math.max((worst - best) / 2.56, 1e-6)
  const dailySigma = horizonSigma / Math.sqrt(Math.max(horizonDays, 1))
  const reversion = 0.15

  // Simulate paths that revert toward the forecast.
  const paths = []
  for (let i = 0; i < simulations; i += 1) {
    const path = new Float64Array(horizonDays + 1)
    path[0] = currentRate
    for (let t = 1; t <= horizonDays; t += 1) {
      const drift = reversion * (expected - path[t - 1])
      path[t] = Math.max(path[t - 1] + drift + normal(0, dailySigma), 0)
    }
    paths.push(path)
  }

  const values = new Float64Array(simulations)
  const stoppingTime = new Int32Array(simulations)

  for (let i = 0; i < simulations; i += 1) {
    values[i] = paths[i][horizonDays] + waitCostPerDay * horizonDays
    stoppingTime[i] = horizonDays
  }

  for (let t = horizonDays - 1; t >= 1; t -= 1) {
    const rates = new Array(simulations)
    for (let i = 0; i < simulations; i += 1) rates[i] = paths[i][t]

    const [a, b, c] = leastSquares3(rates, Array.from(values))

    for (let i = 0; i < simulations; i += 1) {
      const immediate = rates[i] + waitCostPerDay * t
      const continuation = a + b * rates[i] + c * rates[i] * rates[i]
      if (immediate < continuation) {
        values[i] = immediate
        stoppingTime[i] = t
      }
    }
  }

  const costIfFixedToday = currentRate
  const expectedCostIfWaiting = mean(Array.from(values))
  const charterNow = costIfFixedToday <= expectedCostIfWaiting

  let wins = 0
  for (let i = 0; i < simulations; i += 1) if (values[i] < costIfFixedToday) wins += 1

  const dayCounts = new Array(horizonDays + 1).fill(0)
  for (let i = 0; i < simulations; i += 1) dayCounts[stoppingTime[i]] += 1
  const modalDay = dayCounts.indexOf(Math.max(...dayCounts))

  let window
  if (charterNow) window = 'Fix today'
  else if (modalDay <= 3) window = `Fix within ${Math.max(modalDay, 1)}-3 days`
  else if (modalDay <= 7) window = `Fix around day ${modalDay} (this week)`
  else window = `Hold to around day ${modalDay}`

  return {
    decision: charterNow ? 'CHARTER NOW' : 'WAIT',
    recommended_window: window,
    optimal_waiting_days: round(mean(Array.from(stoppingTime)), 2),
    modal_stopping_day: modalDay,
    charter_now_is_optimal: charterNow,
    probability_waiting_wins: round(wins / simulations, 4),
    cost_if_fixed_today: round(costIfFixedToday, 2),
    expected_cost_if_waiting: round(expectedCostIfWaiting, 2),
    expected_saving_per_tonne: round(costIfFixedToday - expectedCostIfWaiting, 2),
    stopping_day_distribution: dayCounts,
    simulations,
    time_steps: horizonDays,
  }
}

// ---------------------------------------------------------------
// (c) Idle scenario management
// ---------------------------------------------------------------

export function estimateBerthWaitDays(congestion, berths) {
  const c = Math.min(Math.max(congestion, 0), 0.98)
  return round((CONGESTION_QUEUE_DAYS * c * c * 2) / Math.max(berths, 1), 2)
}

export function analyseIdle(vesselType, tonnesPerVoyage, loadPort, dischargePort, seaDays, loadCongestion, dischargeCongestion) {
  const loadDays = tonnesPerVoyage / loadPort.cargo_handling_rate
  const dischargeDays = tonnesPerVoyage / dischargePort.cargo_handling_rate

  const loadWait = estimateBerthWaitDays(loadCongestion, loadPort.berths ?? 2)
  const dischargeWait = estimateBerthWaitDays(dischargeCongestion, dischargePort.berths ?? 2)

  const ballastDays = seaDays
  const totalDays = seaDays + ballastDays + loadDays + dischargeDays + loadWait + dischargeWait
  const productiveDays = seaDays + loadDays + dischargeDays
  const idleDays = loadWait + dischargeWait + ballastDays
  const idleShare = totalDays ? idleDays / totalDays : 0

  const agreedLaytime = loadDays + dischargeDays
  const usedLaytime = loadDays + dischargeDays + loadWait + dischargeWait
  const demurrageDays = Math.max(0, usedLaytime - agreedLaytime)
  const demurrageCost = demurrageDays * (DEMURRAGE_USD_PER_DAY[vesselType] ?? 12000)

  const recommendations = []

  if (dischargeWait > 2) {
    recommendations.push({
      type: 'berth_congestion',
      severity: dischargeWait > 4 ? 'high' : 'medium',
      message: `${dischargePort.port} is holding an estimated ${dischargeWait.toFixed(1)} day berth queue. Consider a later laycan, or a less congested East Coast port.`,
    })
  }
  if (ballastDays > seaDays * 0.9) {
    recommendations.push({
      type: 'deadheading',
      severity: 'medium',
      message: `The ballast leg is ${ballastDays.toFixed(1)} days of unpaid steaming. Seek a backhaul cargo out of ${dischargePort.port} to cut deadheading.`,
    })
  }
  if (idleShare > 0.45) {
    recommendations.push({
      type: 'utilisation',
      severity: 'high',
      message: `${Math.round(idleShare * 100)}% of the round trip is non-earning. A term contract across several voyages would spread this idle time over more cargo.`,
    })
  }
  if (demurrageDays > 0.5) {
    recommendations.push({
      type: 'demurrage',
      severity: demurrageDays > 2 ? 'high' : 'medium',
      message: `Projected demurrage of ${demurrageDays.toFixed(1)} days (~$${Math.round(demurrageCost).toLocaleString()}). Negotiate laytime of at least ${usedLaytime.toFixed(1)} days.`,
    })
  }
  if (!recommendations.length) {
    recommendations.push({
      type: 'clear',
      severity: 'low',
      message: 'No material idle-time exposure on this lane at current congestion levels.',
    })
  }

  return {
    sea_days_laden: round(seaDays, 2),
    ballast_days: round(ballastDays, 2),
    load_days: round(loadDays, 2),
    discharge_days: round(dischargeDays, 2),
    load_berth_wait_days: loadWait,
    discharge_berth_wait_days: dischargeWait,
    total_round_trip_days: round(totalDays, 2),
    productive_days: round(productiveDays, 2),
    idle_days: round(idleDays, 2),
    idle_share: round(idleShare, 3),
    projected_laytime_days: round(usedLaytime, 2),
    demurrage_days: round(demurrageDays, 2),
    demurrage_cost_usd: Math.round(demurrageCost),
    recommendations,
  }
}

// ---------------------------------------------------------------
// Objective: spot versus term
// ---------------------------------------------------------------

export function termPremiumFactor(contractDays) {
  const months = contractDays / 30
  return 1 + 0.09 * (1 - Math.exp(-0.45 * months))
}

export function compareSpotVsTerm({
  series,
  cargoQuantity,
  contractDays,
  voyagesRequired,
  volatility,
  riskAversion = 0.5,
  simulations = 3000,
}) {
  const normal = gaussianSampler(SEED + 13)
  const rates = series.length ? series : [0]

  const fixtureDays = []
  for (let i = 0; i < Math.max(voyagesRequired, 1); i += 1) {
    fixtureDays.push(Math.min(Math.round((i * contractDays) / Math.max(voyagesRequired, 1)), rates.length - 1))
  }

  const expectedAtFixture = fixtureDays.map((d) => rates[d])
  const meanExpectedSpot = mean(expectedAtFixture)

  const premium = termPremiumFactor(contractDays)
  const termRate = meanExpectedSpot * premium
  const termTotal = termRate * cargoQuantity

  // Freight markets trend, so fixtures share a systematic shock rather
  // than being independent draws. Without this the risk diversifies away
  // and a term contract never wins, which is the wrong answer.
  const SYSTEMATIC_SHARE = 0.75
  const systematicSigma = volatility * Math.sqrt(SYSTEMATIC_SHARE)
  const idiosyncraticSigma = volatility * Math.sqrt(1 - SYSTEMATIC_SHARE)

  const tonnesPerVoyage = cargoQuantity / Math.max(voyagesRequired, 1)
  const totals = new Float64Array(simulations)

  for (let s = 0; s < simulations; s += 1) {
    const marketShock = normal(0, 1)
    let total = 0
    for (let i = 0; i < fixtureDays.length; i += 1) {
      const horizonScale = Math.sqrt((fixtureDays[i] + 1) / Math.max(rates.length, 1))
      const sampled = Math.max(
        expectedAtFixture[i] + marketShock * systematicSigma * horizonScale + normal(0, idiosyncraticSigma * horizonScale),
        0,
      )
      total += sampled * tonnesPerVoyage
    }
    totals[s] = total
  }

  const arr = Array.from(totals)
  const sorted = [...arr].sort((a, b) => a - b)

  const expectedSpot = mean(arr)
  const p90 = percentile(sorted, 0.9)
  const p10 = percentile(sorted, 0.1)
  const var80 = percentile(sorted, 0.8)
  const tail = arr.filter((v) => v >= var80)
  const cvar = tail.length ? mean(tail) : expectedSpot

  const riskAdjusted = (1 - riskAversion) * expectedSpot + riskAversion * cvar
  const probTermCheaper = arr.filter((v) => v > termTotal).length / simulations

  const recommendation = riskAdjusted < termTotal ? 'SPOT' : 'TERM'

  return {
    recommendation,
    rationale:
      recommendation === 'TERM'
        ? `A ${contractDays}-day term contract at $${round(termRate, 2)}/t beats the risk-adjusted spot programme and is cheaper outright in ${Math.round(probTermCheaper * 100)}% of simulated markets, while securing tonnage across ${voyagesRequired} voyages.`
        : `Repeated spot fixtures are expected to cost $${Math.round(expectedSpot).toLocaleString()} against $${Math.round(termTotal).toLocaleString()} for a ${contractDays}-day term contract. The ${round((premium - 1) * 100, 1)}% term premium outweighs the rate risk over this horizon.`,
    contract_days: contractDays,
    voyages_required: voyagesRequired,
    term_rate_per_tonne: round(termRate, 2),
    term_premium_pct: round((premium - 1) * 100, 2),
    term_total_cost_usd: Math.round(termTotal),
    spot_expected_cost_usd: Math.round(expectedSpot),
    spot_best_case_usd: Math.round(p10),
    spot_worst_case_usd: Math.round(p90),
    spot_cvar80_cost_usd: Math.round(cvar),
    spot_risk_adjusted_cost_usd: Math.round(riskAdjusted),
    probability_term_cheaper: round(probTermCheaper, 4),
    cost_certainty_gain_usd: Math.round(p90 - termTotal),
  }
}

// ---------------------------------------------------------------
// (d) Risk warnings
// ---------------------------------------------------------------

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }

export function buildRiskReport(opts) {
  const {
    best,
    expected,
    worst,
    loadPort,
    dischargePort,
    loadCongestion,
    dischargeCongestion,
    vesselSupply,
    availableVessels,
    netExpectedSaving,
    waitingCost: waitCost,
    probabilityWaitingWins,
    recentVolatility,
  } = opts

  const alerts = []
  const add = (category, severity, title, message, metric) =>
    alerts.push({ category, severity, title, message, metric })

  if (expected > 0) {
    const bandPct = ((worst - best) / expected) * 100
    if (bandPct >= 30) {
      add('volatility', 'high', 'Wide forecast band',
        `The Q10-Q90 band spans ${bandPct.toFixed(0)}% of the expected rate ($${best}-$${worst}/t). Rate risk is elevated; favour shorter commitments or fix term.`,
        round(bandPct, 1))
    } else if (bandPct >= 18) {
      add('volatility', 'medium', 'Moderate rate uncertainty',
        `Forecast band is ${bandPct.toFixed(0)}% of the expected rate. Build tolerance into the laycan rather than fixing on a point estimate.`,
        round(bandPct, 1))
    }

    if (recentVolatility != null) {
      const realisedPct = (recentVolatility / expected) * 100
      if (realisedPct >= 6) {
        add('volatility', 'high', 'Realised volatility accelerating',
          `Rates have moved ${realisedPct.toFixed(1)}% (1 sigma) over the trailing window. Entry windows will be short-lived; monitor daily.`,
          round(realisedPct, 1))
      }
    }
  }

  for (const [port, congestion, role] of [
    [dischargePort, dischargeCongestion, 'discharge'],
    [loadPort, loadCongestion, 'load'],
  ]) {
    if (congestion == null) continue
    const berths = port.berths ?? 2
    if (congestion >= 0.75) {
      add('congestion', 'critical', `Severe congestion at ${port.port}`,
        `${port.port} is running at ${Math.round(congestion * 100)}% berth utilisation across ${berths} berths. Expect multi-day waiting and demurrage on the ${role} leg.`,
        round(congestion, 2))
    } else if (congestion >= 0.55) {
      add('congestion', 'high', `Building congestion at ${port.port}`,
        `${port.port} is at ${Math.round(congestion * 100)}% berth utilisation. Queues are forming; push the laycan later or widen laytime.`,
        round(congestion, 2))
    } else if (congestion >= 0.4) {
      add('congestion', 'medium', `Watch congestion at ${port.port}`,
        `${port.port} is at ${Math.round(congestion * 100)}% utilisation — manageable now, but worth monitoring before fixing.`,
        round(congestion, 2))
    }
  }

  if (vesselSupply != null) {
    if (vesselSupply <= 10) {
      add('supply', 'high', 'Tight tonnage supply',
        `Only ${vesselSupply} vessels are open on this lane. Owners hold pricing power; waiting is more likely to cost than save.`, vesselSupply)
    } else if (vesselSupply >= 32) {
      add('supply', 'info', 'Ample tonnage available',
        `${vesselSupply} vessels are open on this lane. Competition favours the charterer — there is room to negotiate.`, vesselSupply)
    }
  }

  if (availableVessels === 0) {
    add('supply', 'critical', 'No open vessels matched',
      'No available vessel in the tracked fleet matches this lane and class. Widen the vessel class or check an alternative load port.', 0)
  }

  if (waitCost && Math.abs(netExpectedSaving) < waitCost * 1.5) {
    add('decision', 'medium', 'Marginal charter/wait call',
      `Net expected saving ($${netExpectedSaving}/t) is within 1.5x the waiting cost. The recommendation could flip on a small rate move.`,
      netExpectedSaving)
  }

  if (probabilityWaitingWins != null && probabilityWaitingWins >= 0.42 && probabilityWaitingWins <= 0.58) {
    add('decision', 'medium', 'Low conviction on timing',
      `Waiting beats fixing in only ${Math.round(probabilityWaitingWins * 100)}% of simulated markets — close to a coin flip. Prefer the option that preserves flexibility.`,
      round(probabilityWaitingWins, 3))
  }

  alerts.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))

  if (!alerts.length) {
    add('clear', 'info', 'No active warnings',
      'Volatility, congestion and tonnage supply are all within normal ranges for this lane.')
  }

  const counts = alerts.reduce((acc, a) => ({ ...acc, [a.severity]: (acc[a.severity] || 0) + 1 }), {})

  const overall = counts.critical ? 'CRITICAL' : counts.high ? 'HIGH' : counts.medium ? 'MEDIUM' : 'LOW'

  return {
    overall_risk: overall,
    alert_count: alerts.filter((a) => a.category !== 'clear').length,
    counts_by_severity: counts,
    alerts,
  }
}

// ---------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------

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

  const route = resolveRoute(origin, destination)
  if (!route) throw new Error(`No route from ${origin} to ${destination}.`)

  const loadPort = PORTS_BY_NAME[route.origin]
  const dischargePort = PORTS_BY_NAME[route.destination]
  const originCountry = route.origin_country

  // Rate per tonne for each class, from the trained model's output.
  const ratesByClass = {}
  for (const spec of vesselClasses) {
    const f = lookupForecast(originCountry, destination, spec.vessel_type)
    if (f) ratesByClass[spec.vessel_type] = f.expected
  }
  const rateValues = Object.values(ratesByClass)
  ratesByClass.default = rateValues.length ? mean(rateValues) : 0

  const vesselResult = rankVesselClasses(loadPort, dischargePort, cargoQuantity, route.distance, ratesByClass)

  let chosen = vesselResult.recommended
  let userChoiceInfeasible = null

  if (vesselClass) {
    const match = vesselResult.ranked.find((o) => o.vessel_type === vesselClass)
    if (match) chosen = match
    else userChoiceInfeasible = vesselResult.rejected.find((o) => o.vessel_type === vesselClass) || null
  }

  if (!chosen) {
    throw new Error(`No vessel class can physically serve ${loadPort.port} to ${dischargePort.port}.`)
  }

  const forecast = lookupForecast(originCountry, destination, chosen.vessel_type)
  if (!forecast) throw new Error('No forecast available for this lane.')

  const horizonDays = forecast.horizon_days || 14
  const series = buildSeries(forecast.current_rate, forecast.expected, forecast.best, forecast.worst, horizonDays)

  const wait = waitingCost({ cargoQuantity, cargoValuePerTon, annualCarryingRate })
  const waitPerTonneDay = wait.waiting_cost_per_tonne_day
  const waitOverHorizon = waitPerTonneDay * horizonDays

  const decision = charterDecision(forecast.current_rate, forecast.best, forecast.expected, forecast.worst, waitOverHorizon)

  const simulation = monteCarlo(forecast.current_rate, forecast.best, forecast.expected, forecast.worst, waitOverHorizon)

  const timing = optimalStopping(
    forecast.current_rate, forecast.expected, forecast.best, forecast.worst, waitPerTonneDay, horizonDays,
  )

  const loadCongestion = Math.min(forecast.congestion * 1.1, 0.95)

  const idle = analyseIdle(
    chosen.vessel_type, chosen.tonnes_per_voyage, loadPort, dischargePort,
    chosen.sea_days, loadCongestion, forecast.congestion,
  )

  const contract = compareSpotVsTerm({
    series: series.map((p) => p.expected),
    cargoQuantity,
    contractDays: contractDuration,
    voyagesRequired: chosen.voyages_required,
    volatility: Math.max(forecast.volatility, forecast.current_rate * 0.03),
  })

  const openVessels = fleet.filter(
    (v) => v.location === loadPort.port && v.status === 'available' && v.vessel_type === chosen.vessel_type,
  )

  const risk = buildRiskReport({
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
  })

  return {
    request: { origin, origin_country: originCountry, destination, cargo_quantity: cargoQuantity, contract_duration_days: contractDuration },
    route: {
      load_port: loadPort.port,
      load_port_unlocode: loadPort.unlocode,
      load_port_lat: loadPort.latitude,
      load_port_lon: loadPort.longitude,
      discharge_port: dischargePort.port,
      discharge_port_unlocode: dischargePort.unlocode,
      discharge_port_lat: dischargePort.latitude,
      discharge_port_lon: dischargePort.longitude,
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
    decision: { ...decision, waiting_cost_per_tonne_day: waitPerTonneDay, waiting_cost_detail: wait },
    confidence: decision.confidence,
    risk_level: decision.risk,
    optimal_timing: timing,
    monte_carlo: simulation,
    vessel_recommendation: { ...vesselResult, chosen, user_choice_infeasible: userChoiceInfeasible, open_vessels: openVessels },
    idle,
    contract_strategy: contract,
    risk,
    model: modelMetrics,
    fleet,
  }
}
