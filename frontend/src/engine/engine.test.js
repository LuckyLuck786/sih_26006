/**
 * Tests for the browser decision engine.
 *
 * The engine mirrors the Python package in `ml/`, so these assertions
 * deliberately match the ones in `tests/` on the Python side. Where both
 * implementations compute the same quantity from the same inputs they
 * must agree, and where one was fixed the other carries the same fix.
 *
 * Every import here goes through `./index`, which is the module's public
 * surface. That is what makes the file-level split safe: the tests never
 * reference an internal path, so moving code between modules cannot
 * break them as long as the re-exports stay intact.
 */

import { describe, expect, it } from 'vitest'

import {
  analyseIdle,
  analyzeShipmentLocal,
  buildRiskReport,
  charterDecision,
  compareSpotVsTerm,
  DESTINATIONS,
  draftLimitedPayload,
  estimateBerthWaitDays,
  monteCarlo,
  optimalStopping,
  ORIGINS,
  PORTS_BY_NAME,
  rankVesselClasses,
  resolveRoute,
  termPremiumFactor,
  VESSEL_CLASSES,
  waitingCost,
} from './index'

const PS_ORIGINS = ['Australia', 'Indonesia', 'Mozambique', 'Russia', 'United States']

const PS_PORTS = [
  'Paradip',
  'Vizag',
  'Gangavaram',
  'Gopalpur',
  'Dhamra',
  'Haldia',
  'Sagar-Sandheads',
]

const RATES = { Handysize: 34, Supramax: 28, Panamax: 24, Capesize: 18 }

describe('reference data', () => {
  it('covers every origin named in the problem statement', () => {
    expect(ORIGINS).toEqual(expect.arrayContaining(PS_ORIGINS))
  })

  it('covers every discharge port named in the problem statement', () => {
    expect(DESTINATIONS).toEqual(expect.arrayContaining(PS_PORTS))
  })

  it('models all four vessel classes', () => {
    expect(VESSEL_CLASSES.map((c) => c.vessel_type).sort()).toEqual([
      'Capesize',
      'Handysize',
      'Panamax',
      'Supramax',
    ])
  })
})

describe('resolveRoute', () => {
  it('resolves an international lane by origin country', () => {
    expect(resolveRoute('Australia', 'Paradip')).not.toBeNull()
  })

  it('picks the nearest load port for a country', () => {
    expect(resolveRoute('Australia', 'Paradip').origin).toBe('Port Hedland')
  })

  it('returns null for an unknown origin', () => {
    expect(resolveRoute('Atlantis', 'Paradip')).toBeNull()
  })
})

describe('draftLimitedPayload', () => {
  it('allows full deadweight at a deep port', () => {
    expect(draftLimitedPayload(76000, 14.2, 20)).toBe(76000)
  })

  it('part-loads rather than excluding at a shallow port', () => {
    const payload = draftLimitedPayload(76000, 14.2, 8.5)
    expect(payload).toBeGreaterThan(20000)
    expect(payload).toBeLessThan(40000)
  })

  it('returns zero when the vessel cannot float', () => {
    expect(draftLimitedPayload(180000, 18.2, 5)).toBe(0)
  })

  it('increases monotonically with available draft', () => {
    const payloads = [9, 11, 13, 15].map((d) => draftLimitedPayload(76000, 14.2, d))
    expect(payloads).toEqual([...payloads].sort((a, b) => a - b))
  })
})

describe('rankVesselClasses', () => {
  const rank = (discharge, quantity = 120000) =>
    rankVesselClasses(PORTS_BY_NAME.Newcastle, PORTS_BY_NAME[discharge], quantity, 5793, RATES)

  it('prefers the largest class at a deep port', () => {
    expect(rank('Gangavaram').recommended.vessel_type).toBe('Capesize')
  })

  it('ranks by ascending cost per tonne', () => {
    const costs = rank('Gangavaram').ranked.map((o) => o.cost_per_tonne_usd)
    expect(costs).toEqual([...costs].sort((a, b) => a - b))
  })

  it('rejects Capesize and Panamax at Haldia with reasons', () => {
    const rejected = Object.fromEntries(
      rank('Haldia').rejected.map((o) => [o.vessel_type, o.reasons.join('; ')]),
    )
    expect(rejected.Capesize).toMatch(/LOA/)
    expect(rejected.Panamax).toMatch(/Beam/)
  })

  it('costs more per tonne at a draft-restricted port', () => {
    expect(rank('Haldia').recommended.cost_per_tonne_usd).toBeGreaterThan(
      rank('Gangavaram').recommended.cost_per_tonne_usd,
    )
  })

  it('splits a parcel into multiple voyages when draft-limited', () => {
    expect(rank('Haldia').recommended.voyages_required).toBeGreaterThan(1)
  })

  it('cost components sum to the total', () => {
    const o = rank('Paradip').recommended
    const parts = o.freight_cost_usd + o.hire_cost_usd + o.bunker_cost_usd + o.port_charges_usd
    expect(parts).toBeCloseTo(o.total_cost_usd, -1)
  })
})

describe('waitingCost', () => {
  it('derives the daily carrying cost from the annual rate', () => {
    const result = waitingCost({
      cargoQuantity: 50000,
      cargoValuePerTon: 10000,
      annualCarryingRate: 0.08,
    })
    expect(result.cargo_value).toBe(500000000)
    expect(result.daily_carrying_cost).toBeCloseTo((500000000 * 0.08) / 365, 0)
  })
})

describe('charterDecision', () => {
  it('waits when the forecast falls below the current rate', () => {
    expect(charterDecision(32, 27, 29, 35, 0.5).decision).toBe('WAIT')
  })

  it('charters now when the forecast rises', () => {
    expect(charterDecision(24, 27, 29, 35, 0.5).decision).toBe('CHARTER NOW')
  })

  it('lets waiting cost flip the call', () => {
    expect(charterDecision(30, 28, 29, 30, 0.1).decision).toBe('WAIT')
    expect(charterDecision(30, 28, 29, 30, 5).decision).toBe('CHARTER NOW')
  })

  it.each([
    [28.5, 29.5, 'LOW'],
    [26, 31, 'MEDIUM'],
    [20, 40, 'HIGH'],
  ])('bands risk from the forecast spread (%s-%s)', (best, worst, risk) => {
    expect(charterDecision(30, best, 29, worst, 0.1).risk).toBe(risk)
  })
})

describe('monteCarlo', () => {
  it('is reproducible', () => {
    expect(monteCarlo(32, 27, 29, 35, 0.5)).toEqual(monteCarlo(32, 27, 29, 35, 0.5))
  })

  it('orders its percentiles', () => {
    const r = monteCarlo(32, 27, 29, 35, 0.5)
    expect(r.simulated_q10).toBeLessThanOrEqual(r.simulated_q50)
    expect(r.simulated_q50).toBeLessThanOrEqual(r.simulated_q90)
  })

  it('keeps probabilities in range', () => {
    const r = monteCarlo(32, 27, 29, 35, 0.5)
    for (const key of ['probability_of_saving', 'probability_rate_increase']) {
      expect(r[key]).toBeGreaterThanOrEqual(0)
      expect(r[key]).toBeLessThanOrEqual(1)
    }
  })
})

describe('optimalStopping', () => {
  it('waits in a falling market', () => {
    const r = optimalStopping(32, 28, 26, 33, 0.08, 14, 1500)
    expect(r.decision).toBe('WAIT')
    expect(r.probability_waiting_wins).toBeGreaterThan(0.5)
  })

  it('fixes today in a rising market', () => {
    expect(optimalStopping(24, 29, 26, 33, 0.08, 14, 1500).decision).toBe('CHARTER NOW')
  })

  it('does not always report the same day-zero answer', () => {
    const rising = optimalStopping(24, 29, 26, 33, 0.08, 14, 1500)
    const falling = optimalStopping(32, 28, 26, 33, 0.08, 14, 1500)
    expect(rising.charter_now_is_optimal).not.toBe(falling.charter_now_is_optimal)
  })

  it('shortens the wait as waiting cost rises', () => {
    const cheap = optimalStopping(32, 28, 26, 33, 0.01, 14, 1500)
    const dear = optimalStopping(32, 28, 26, 33, 2, 14, 1500)
    expect(dear.optimal_waiting_days).toBeLessThanOrEqual(cheap.optimal_waiting_days)
  })

  it('actually uses the forecast', () => {
    const low = optimalStopping(30, 20, 18, 24, 0.05, 14, 1500)
    const high = optimalStopping(30, 40, 36, 46, 0.05, 14, 1500)
    expect(low.expected_cost_if_waiting).toBeLessThan(high.expected_cost_if_waiting)
  })

  it('distributes stopping days across the horizon', () => {
    const r = optimalStopping(32, 28, 26, 33, 0.08, 14, 1500)
    expect(r.stopping_day_distribution).toHaveLength(15)
    expect(r.stopping_day_distribution.reduce((a, b) => a + b, 0)).toBe(r.simulations)
  })
})

describe('idle management', () => {
  it('grows the berth queue convexly with congestion', () => {
    const low = estimateBerthWaitDays(0.3, 3)
    const high = estimateBerthWaitDays(0.6, 3)
    expect(high).toBeGreaterThan(2 * low)
  })

  it('absorbs the queue with more berths', () => {
    expect(estimateBerthWaitDays(0.8, 5)).toBeLessThan(estimateBerthWaitDays(0.8, 1))
  })

  it('splits the round trip into productive and idle days', () => {
    const r = analyseIdle(
      'Panamax',
      70000,
      PORTS_BY_NAME.Newcastle,
      PORTS_BY_NAME.Gangavaram,
      17.9,
      0.3,
      0.25,
    )
    expect(r.productive_days + r.idle_days).toBeCloseTo(r.total_round_trip_days, 1)
    expect(r.idle_share).toBeGreaterThan(0)
    expect(r.idle_share).toBeLessThan(1)
  })

  it('always returns at least one recommendation', () => {
    const r = analyseIdle(
      'Panamax',
      70000,
      PORTS_BY_NAME.Newcastle,
      PORTS_BY_NAME.Gangavaram,
      17.9,
      0.05,
      0.05,
    )
    expect(r.recommendations.length).toBeGreaterThan(0)
  })
})

describe('spot versus term', () => {
  const series = Array.from({ length: 90 }, (_, d) => 29 + 0.02 * d)

  const run = (volatility) =>
    compareSpotVsTerm({
      series,
      cargoQuantity: 300000,
      contractDays: 90,
      voyagesRequired: 5,
      volatility,
    })

  it('prices the term premium upward with duration', () => {
    expect(termPremiumFactor(30)).toBeLessThan(termPremiumFactor(90))
    expect(termPremiumFactor(90)).toBeLessThan(termPremiumFactor(365))
  })

  it('prefers spot in a calm market', () => {
    expect(run(1).recommendation).toBe('SPOT')
  })

  it('prefers term in a volatile market', () => {
    expect(run(8).recommendation).toBe('TERM')
  })

  it('has a crossover rather than one fixed answer', () => {
    const picks = new Set([1, 4.5, 8, 12].map((v) => run(v).recommendation))
    expect(picks).toEqual(new Set(['SPOT', 'TERM']))
  })

  it('keeps the tail at or above the expected cost', () => {
    const r = run(6)
    expect(r.spot_cvar80_cost_usd).toBeGreaterThanOrEqual(r.spot_expected_cost_usd)
  })

  it('is reproducible', () => {
    expect(run(5)).toEqual(run(5))
  })
})

describe('risk report', () => {
  const report = (overrides = {}) =>
    buildRiskReport({
      best: 27,
      expected: 29,
      worst: 31,
      loadPort: PORTS_BY_NAME.Newcastle,
      dischargePort: PORTS_BY_NAME.Paradip,
      loadCongestion: 0.2,
      dischargeCongestion: 0.2,
      vesselSupply: 20,
      availableVessels: 3,
      netExpectedSaving: 5,
      waitingCost: 0.5,
      probabilityWaitingWins: 0.8,
      ...overrides,
    })

  it('reports a quiet lane as low risk', () => {
    expect(report().overall_risk).toBe('LOW')
  })

  it('escalates severe congestion to critical', () => {
    expect(report({ dischargeCongestion: 0.9 }).overall_risk).toBe('CRITICAL')
  })

  it('escalates when no vessels are open', () => {
    expect(report({ availableVessels: 0 }).overall_risk).toBe('CRITICAL')
  })

  it('sorts alerts most severe first', () => {
    const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
    const ranks = report({ dischargeCongestion: 0.9, vesselSupply: 5 }).alerts.map(
      (a) => order[a.severity],
    )
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })
})

describe('analyzeShipmentLocal', () => {
  const base = {
    origin: 'Australia',
    destination: 'Paradip',
    cargo_quantity: 120000,
    contract_duration: 90,
  }

  it('returns a decision for the flagship lane', () => {
    expect(analyzeShipmentLocal(base).vessel_recommendation.chosen).toBeTruthy()
  })

  it('covers every requirement in the response', () => {
    const result = analyzeShipmentLocal(base)
    for (const key of [
      'forecast',
      'forecast_series',
      'decision',
      'optimal_timing',
      'vessel_recommendation',
      'idle',
      'contract_strategy',
      'risk',
    ]) {
      expect(result).toHaveProperty(key)
    }
  })

  it('orders the forecast quantiles', () => {
    const f = analyzeShipmentLocal(base).forecast
    expect(f.best).toBeLessThanOrEqual(f.expected)
    expect(f.expected).toBeLessThanOrEqual(f.worst)
  })

  it('widens the band across the horizon', () => {
    const s = analyzeShipmentLocal(base).forecast_series
    expect(s.at(-1).upper - s.at(-1).lower).toBeGreaterThan(s[1].upper - s[1].lower)
  })

  it('throws on an unknown lane', () => {
    expect(() => analyzeShipmentLocal({ ...base, origin: 'Atlantis' })).toThrow()
  })

  it.each(PS_PORTS)('runs for %s', (destination) => {
    const result = analyzeShipmentLocal({ ...base, destination, cargo_quantity: 60000 })
    expect(result.vessel_recommendation.chosen).toBeTruthy()
  })

  it('needs more voyages for a larger parcel', () => {
    const small = analyzeShipmentLocal({ ...base, destination: 'Haldia', cargo_quantity: 20000 })
    const large = analyzeShipmentLocal({ ...base, destination: 'Haldia', cargo_quantity: 250000 })
    expect(large.vessel_recommendation.chosen.voyages_required).toBeGreaterThan(
      small.vessel_recommendation.chosen.voyages_required,
    )
  })

  it('honours an explicit feasible vessel class', () => {
    const result = analyzeShipmentLocal({ ...base, vessel_class: 'Panamax' })
    expect(result.vessel_recommendation.chosen.vessel_type).toBe('Panamax')
  })

  it('reports an infeasible explicit class instead of failing', () => {
    const result = analyzeShipmentLocal({
      ...base,
      destination: 'Haldia',
      vessel_class: 'Capesize',
    })
    expect(result.vessel_recommendation.user_choice_infeasible).toBeTruthy()
    expect(result.vessel_recommendation.chosen.vessel_type).not.toBe('Capesize')
  })
})
