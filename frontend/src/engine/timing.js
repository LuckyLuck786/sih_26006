/**
 * Waiting cost, the charter/wait call, Monte Carlo and optimal stopping.
 *
 * Mirrors `ml/decision/waiting_cost.py`, `charter_decision.py`,
 * `monte_carlo.py` and `longstaff_schwartz.py`. Optimal stopping answers
 * PS 26006 requirement (a): when to enter the market.
 */

import { SEED } from './constants'
import { gaussianSampler, mean, percentile, round } from './math'

export function waitingCost({
  cargoQuantity,
  cargoValuePerTon,
  annualCarryingRate,
  storagePerDay = 0,
  opsPerDay = 0,
}) {
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
    probability_rate_increase: round(
      futureRates.filter((r) => r > currentRate).length / simulations,
      4,
    ),
    probability_rate_decrease: round(
      futureRates.filter((r) => r < currentRate).length / simulations,
      4,
    ),
  }
}

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

export function optimalStopping(
  currentRate,
  expected,
  best,
  worst,
  waitCostPerDay,
  horizonDays = 14,
  simulations = 3000,
) {
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
