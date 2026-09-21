/**
 * Shared constants for the decision engine.
 *
 * These mirror the module-level constants in the Python package so both
 * implementations produce identical numbers from identical inputs.
 */

// Shared with the Python side so both produce identical runs.
export const SEED = 26006

export const LIGHTSHIP_DRAFT_RATIO = 0.35
export const UNDER_KEEL_CLEARANCE_M = 0.5
export const BUNKER_PRICE_USD_PER_TONNE = 620
export const PORT_CHARGE_USD_PER_DWT = 0.42
export const CONGESTION_QUEUE_DAYS = 9

export const DEMURRAGE_USD_PER_DAY = {
  Handysize: 8000,
  Supramax: 11000,
  Panamax: 14000,
  Capesize: 22000,
}
