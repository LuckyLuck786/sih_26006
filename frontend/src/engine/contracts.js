/**
 * Spot versus term — the stated Objective of PS 26006.
 *
 * Mirrors `ml/decision/contract_strategy.py`. Fixtures share a systematic
 * shock because freight markets trend; independent draws would diversify
 * the tail away and make a term contract look pointless.
 */

import { SEED } from './constants'
import { gaussianSampler, mean, percentile, round } from './math'

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
    fixtureDays.push(
      Math.min(Math.round((i * contractDays) / Math.max(voyagesRequired, 1)), rates.length - 1),
    )
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
        expectedAtFixture[i] +
          marketShock * systematicSigma * horizonScale +
          normal(0, idiosyncraticSigma * horizonScale),
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
