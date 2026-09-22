/**
 * Execution trace for the decision pipeline.
 *
 * The dashboard shows the pipeline running stage by stage. Those stages
 * and their timings are recorded here as the engine actually executes
 * them, so the strip reports work that happened rather than animating a
 * fixed sequence. If a stage is skipped or throws, the trace says so.
 *
 * Stage ids and labels mirror `ml/pipeline.py`, which runs the same
 * sequence in Python.
 */

const now = () =>
  typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()

export const STAGES = [
  { id: 'route', label: 'Lane resolution', detail: 'Nearest load port, sea distance' },
  { id: 'forecast', label: 'Quantile forecast', detail: 'LightGBM Q10/Q50/Q90 at 14d' },
  { id: 'vessel', label: 'Vessel optimisation', detail: 'Draft-limited payload, 4 classes' },
  { id: 'waiting', label: 'Waiting cost', detail: 'Carrying cost per tonne per day' },
  { id: 'decision', label: 'Charter decision', detail: 'Expected saving net of waiting' },
  { id: 'montecarlo', label: 'Monte Carlo', detail: 'Seeded rate distribution' },
  { id: 'stopping', label: 'Optimal stopping', detail: 'Longstaff-Schwartz backward induction' },
  { id: 'idle', label: 'Idle analysis', detail: 'Berth queue, ballast, demurrage' },
  { id: 'contract', label: 'Contract strategy', detail: 'Spot vs term, CVaR at 80%' },
  { id: 'risk', label: 'Risk evaluation', detail: 'Volatility, congestion, supply' },
]

export function createTrace() {
  const entries = []
  const startedAt = now()

  return {
    /** Run `fn` as a named stage, recording its duration and outcome. */
    stage(id, fn) {
      const begin = now()
      try {
        const value = fn()
        entries.push({ id, ms: now() - begin, status: 'ok' })
        return value
      } catch (error) {
        entries.push({ id, ms: now() - begin, status: 'failed', error: error.message })
        throw error
      }
    },

    /** Record a stage that was deliberately not run. */
    skip(id, reason) {
      entries.push({ id, ms: 0, status: 'skipped', note: reason })
    },

    /** Attach a measured quantity to the stage just recorded. */
    annotate(id, note) {
      const entry = entries.find((e) => e.id === id)
      if (entry) entry.note = note
    },

    summary() {
      const total = now() - startedAt
      const byId = Object.fromEntries(entries.map((e) => [e.id, e]))

      return {
        total_ms: Math.round(total * 100) / 100,
        stages: STAGES.map((stage) => {
          const entry = byId[stage.id]
          return {
            ...stage,
            ms: entry ? Math.round(entry.ms * 100) / 100 : null,
            status: entry ? entry.status : 'not-run',
            note: entry?.note ?? null,
            error: entry?.error ?? null,
          }
        }),
      }
    },
  }
}
