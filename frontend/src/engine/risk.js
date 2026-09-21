/**
 * Early-warning engine — PS 26006 requirement (d).
 *
 * Mirrors `ml/risk/alerts.py`.
 */

import { round } from './math'

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
      add(
        'volatility',
        'high',
        'Wide forecast band',
        `The Q10-Q90 band spans ${bandPct.toFixed(0)}% of the expected rate ($${best}-$${worst}/t). Rate risk is elevated; favour shorter commitments or fix term.`,
        round(bandPct, 1),
      )
    } else if (bandPct >= 18) {
      add(
        'volatility',
        'medium',
        'Moderate rate uncertainty',
        `Forecast band is ${bandPct.toFixed(0)}% of the expected rate. Build tolerance into the laycan rather than fixing on a point estimate.`,
        round(bandPct, 1),
      )
    }

    if (recentVolatility != null) {
      const realisedPct = (recentVolatility / expected) * 100
      if (realisedPct >= 6) {
        add(
          'volatility',
          'high',
          'Realised volatility accelerating',
          `Rates have moved ${realisedPct.toFixed(1)}% (1 sigma) over the trailing window. Entry windows will be short-lived; monitor daily.`,
          round(realisedPct, 1),
        )
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
      add(
        'congestion',
        'critical',
        `Severe congestion at ${port.port}`,
        `${port.port} is running at ${Math.round(congestion * 100)}% berth utilisation across ${berths} berths. Expect multi-day waiting and demurrage on the ${role} leg.`,
        round(congestion, 2),
      )
    } else if (congestion >= 0.55) {
      add(
        'congestion',
        'high',
        `Building congestion at ${port.port}`,
        `${port.port} is at ${Math.round(congestion * 100)}% berth utilisation. Queues are forming; push the laycan later or widen laytime.`,
        round(congestion, 2),
      )
    } else if (congestion >= 0.4) {
      add(
        'congestion',
        'medium',
        `Watch congestion at ${port.port}`,
        `${port.port} is at ${Math.round(congestion * 100)}% utilisation — manageable now, but worth monitoring before fixing.`,
        round(congestion, 2),
      )
    }
  }

  if (vesselSupply != null) {
    if (vesselSupply <= 10) {
      add(
        'supply',
        'high',
        'Tight tonnage supply',
        `Only ${vesselSupply} vessels are open on this lane. Owners hold pricing power; waiting is more likely to cost than save.`,
        vesselSupply,
      )
    } else if (vesselSupply >= 32) {
      add(
        'supply',
        'info',
        'Ample tonnage available',
        `${vesselSupply} vessels are open on this lane. Competition favours the charterer — there is room to negotiate.`,
        vesselSupply,
      )
    }
  }

  if (availableVessels === 0) {
    add(
      'supply',
      'critical',
      'No open vessels matched',
      'No available vessel in the tracked fleet matches this lane and class. Widen the vessel class or check an alternative load port.',
      0,
    )
  }

  if (waitCost && Math.abs(netExpectedSaving) < waitCost * 1.5) {
    add(
      'decision',
      'medium',
      'Marginal charter/wait call',
      `Net expected saving ($${netExpectedSaving}/t) is within 1.5x the waiting cost. The recommendation could flip on a small rate move.`,
      netExpectedSaving,
    )
  }

  if (
    probabilityWaitingWins != null &&
    probabilityWaitingWins >= 0.42 &&
    probabilityWaitingWins <= 0.58
  ) {
    add(
      'decision',
      'medium',
      'Low conviction on timing',
      `Waiting beats fixing in only ${Math.round(probabilityWaitingWins * 100)}% of simulated markets — close to a coin flip. Prefer the option that preserves flexibility.`,
      round(probabilityWaitingWins, 3),
    )
  }

  alerts.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))

  if (!alerts.length) {
    add(
      'clear',
      'info',
      'No active warnings',
      'Volatility, congestion and tonnage supply are all within normal ranges for this lane.',
    )
  }

  const counts = alerts.reduce(
    (acc, a) => ({ ...acc, [a.severity]: (acc[a.severity] || 0) + 1 }),
    {},
  )

  const overall = counts.critical
    ? 'CRITICAL'
    : counts.high
      ? 'HIGH'
      : counts.medium
        ? 'MEDIUM'
        : 'LOW'

  return {
    overall_risk: overall,
    alert_count: alerts.filter((a) => a.category !== 'clear').length,
    counts_by_severity: counts,
    alerts,
  }
}
