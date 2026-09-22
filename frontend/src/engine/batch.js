/**
 * Batch parcel analysis.
 *
 * SAIL does not procure one cargo. A planner holds a list of parcels for
 * the quarter and needs the same decision on every line, ranked, with
 * the ones that cannot be served flagged rather than silently dropped.
 *
 * Each row is a full pipeline run through the same orchestrator the
 * single-shipment view uses. A run is roughly 34 ms, so a hundred-line
 * list completes in a few seconds without leaving the browser, which
 * also means the parcel list is never uploaded anywhere.
 */

import { analyzeShipmentLocal } from './index'

export const REQUIRED_COLUMNS = ['origin', 'destination', 'cargo_quantity']

export const OPTIONAL_COLUMNS = [
  'contract_duration',
  'vessel_class',
  'cargo_type',
  'cargo_value_per_ton',
  'reference',
]

/**
 * Minimal CSV reader.
 *
 * Handles quoted fields and escaped quotes, which is all a parcel list
 * needs. Deliberately not a dependency: the format here is a header row
 * and numbers.
 */
export function parseCsv(text) {
  const rows = []
  let field = ''
  let row = []
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      if (row.some((cell) => cell.trim() !== '')) rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  row.push(field)
  if (row.some((cell) => cell.trim() !== '')) rows.push(row)

  if (!rows.length) return { header: [], records: [] }

  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))

  const records = rows
    .slice(1)
    .map((cells) =>
      Object.fromEntries(header.map((key, index) => [key, (cells[index] ?? '').trim()])),
    )

  return { header, records }
}

function toNumber(value) {
  if (value === undefined || value === null || value === '') return undefined
  const cleaned = String(value).replace(/[, ]/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** Run every parcel and rank the feasible ones by total cost. */
export function analyzeBatch(records) {
  const results = []

  records.forEach((record, index) => {
    const line = index + 2 // header is line 1

    const origin = record.origin
    const destination = record.destination
    const quantity = toNumber(record.cargo_quantity)

    if (!origin || !destination || !quantity) {
      results.push({
        line,
        ok: false,
        reference: record.reference || `row ${line}`,
        origin,
        destination,
        reason: 'origin, destination and cargo_quantity are all required',
      })
      return
    }

    try {
      const result = analyzeShipmentLocal({
        origin,
        destination,
        cargo_quantity: quantity,
        contract_duration: toNumber(record.contract_duration) ?? 30,
        vessel_class: record.vessel_class || null,
        cargo_value_per_ton: toNumber(record.cargo_value_per_ton) ?? 9500,
      })

      const chosen = result.vessel_recommendation.chosen

      results.push({
        line,
        ok: true,
        reference: record.reference || `${origin}-${destination}-${line}`,
        origin,
        destination,
        cargo_quantity: quantity,
        load_port: result.route.load_port,
        vessel_type: chosen.vessel_type,
        voyages_required: chosen.voyages_required,
        cost_per_tonne_usd: chosen.cost_per_tonne_usd,
        total_cost_usd: chosen.total_cost_usd,
        decision: result.decision.decision,
        timing: result.optimal_timing.recommended_window,
        contract: result.contract_strategy.recommendation,
        risk: result.risk.overall_risk,
        idle_days: result.idle.idle_days,
        rejected_classes: result.vessel_recommendation.rejected.map((r) => r.vessel_type),
      })
    } catch (error) {
      results.push({
        line,
        ok: false,
        reference: record.reference || `row ${line}`,
        origin,
        destination,
        reason: error.message,
      })
    }
  })

  const ok = results.filter((r) => r.ok)

  const totals = {
    parcels: results.length,
    priced: ok.length,
    failed: results.length - ok.length,
    tonnage: ok.reduce((sum, r) => sum + r.cargo_quantity, 0),
    total_cost_usd: Math.round(ok.reduce((sum, r) => sum + r.total_cost_usd, 0)),
    charter_now: ok.filter((r) => r.decision === 'CHARTER NOW').length,
    wait: ok.filter((r) => r.decision === 'WAIT').length,
    term: ok.filter((r) => r.contract === 'TERM').length,
    elevated_risk: ok.filter((r) => r.risk === 'HIGH' || r.risk === 'CRITICAL').length,
  }

  return { results, totals }
}

/** A worked example, so the format is obvious without documentation. */
export const SAMPLE_CSV = `reference,origin,destination,cargo_quantity,contract_duration,cargo_value_per_ton
Q1-COAL-001,Australia,Paradip,120000,90,9500
Q1-COAL-002,Australia,Gangavaram,160000,90,9500
Q1-COAL-003,Indonesia,Vizag,55000,30,8200
Q1-IORE-004,Australia,Haldia,45000,60,11000
Q1-COAL-005,Mozambique,Dhamra,75000,120,9800
Q1-COAL-006,Russia,Paradip,90000,90,9400
Q1-IORE-007,United States,Gopalpur,28000,45,12500
Q1-COAL-008,Indonesia,Sagar-Sandheads,40000,60,8600
`

/** Serialise results back to CSV for the planner's own records. */
export function resultsToCsv(results) {
  const header = [
    'reference',
    'origin',
    'load_port',
    'destination',
    'cargo_quantity',
    'vessel_type',
    'voyages_required',
    'cost_per_tonne_usd',
    'total_cost_usd',
    'decision',
    'timing',
    'contract',
    'risk',
    'status',
  ]

  const lines = results.map((r) =>
    [
      r.reference,
      r.origin ?? '',
      r.load_port ?? '',
      r.destination ?? '',
      r.cargo_quantity ?? '',
      r.vessel_type ?? '',
      r.voyages_required ?? '',
      r.cost_per_tonne_usd ?? '',
      r.total_cost_usd ?? '',
      r.decision ?? '',
      r.timing ?? '',
      r.contract ?? '',
      r.risk ?? '',
      r.ok ? 'priced' : `failed: ${r.reason}`,
    ]
      .map((cell) => {
        const value = String(cell)
        return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
      })
      .join(','),
  )

  return [header.join(','), ...lines].join('\n')
}
