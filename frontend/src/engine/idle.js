/**
 * Idle-scenario management — PS 26006 requirement (c).
 *
 * Mirrors `ml/decision/idle_management.py`. Built on the port cargo
 * handling rates that were present in ports.json from the start but were
 * never read by any calculation.
 */

import { CONGESTION_QUEUE_DAYS, DEMURRAGE_USD_PER_DAY } from './constants'
import { round } from './math'

export function estimateBerthWaitDays(congestion, berths) {
  const c = Math.min(Math.max(congestion, 0), 0.98)
  return round((CONGESTION_QUEUE_DAYS * c * c * 2) / Math.max(berths, 1), 2)
}

export function analyseIdle(
  vesselType,
  tonnesPerVoyage,
  loadPort,
  dischargePort,
  seaDays,
  loadCongestion,
  dischargeCongestion,
) {
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
