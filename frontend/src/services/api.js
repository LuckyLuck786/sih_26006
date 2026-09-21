import { analyzeShipmentLocal } from '../engine'

/**
 * Two execution modes, same response contract.
 *
 * Default (VITE_USE_MOCK unset or not 'false'):
 *   The decision runs in the browser via `src/engine`, using the trained
 *   LightGBM quantile models' exported forecasts. This is not mock data —
 *   every number is computed from the user's inputs.
 *
 * VITE_USE_MOCK=false:
 *   Calls the FastAPI service in `backend/`, which runs the same logic in
 *   Python against the live models and can enrich with Data Docked AIS.
 */

const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration))

export async function analyzeShipment(payload) {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    // A short pause so the loading state is visible; the computation
    // itself is near-instant.
    await wait(450)
    return analyzeShipmentLocal(payload)
  }

  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

  try {
    const response = await fetch(`${baseUrl}/forecast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      throw new Error(`Forecast request failed (${response.status})`)
    }
    return await response.json()
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Unable to reach the forecast service. Check that the API is running.')
    }
    throw new Error(error.message || 'The forecast service returned an unexpected error.')
  }
}

/**
 * Live vessel positions near a point.
 *
 * Calls our own serverless proxy so the Data Docked key stays server-side
 * — a VITE_ variable would be compiled into the public bundle. Always
 * resolves: on any failure it reports the simulated fleet instead, and
 * the caller shows which source was used.
 */
export async function fetchNearbyVessels({ latitude, longitude, radius = 50 }) {
  try {
    const response = await fetch(
      `/api/ais?latitude=${latitude}&longitude=${longitude}&radius=${radius}`,
    )
    if (!response.ok) return { source: 'simulated', reason: `http_${response.status}`, vessels: [] }
    return await response.json()
  } catch {
    return { source: 'simulated', reason: 'unreachable', vessels: [] }
  }
}
