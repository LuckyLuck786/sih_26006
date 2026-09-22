/**
 * Remaining Data Docked credits.
 *
 * The AIS account is metered and a spent balance surfaces as HTTP 400 on
 * the vessel endpoints, which is indistinguishable from a bad parameter.
 * This route makes the difference visible instead of guessable.
 *
 * Reads DATADOCKED_API_KEY server-side, same as `api/ais.js`. The key is
 * never returned.
 */

const DATADOCKED_BASE = 'https://datadocked.com/api/vessels_operations'

export default async function handler(request, response) {
  const apiKey = process.env.DATADOCKED_API_KEY

  if (!apiKey) {
    return response.status(200).json({ configured: false, reason: 'no_api_key' })
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)

    const upstream = await fetch(`${DATADOCKED_BASE}/my-credits`, {
      headers: { accept: 'application/json', 'x-api-key': apiKey },
      signal: controller.signal,
    })

    clearTimeout(timeout)

    const body = await upstream.text()

    return response.status(200).json({
      configured: true,
      upstream_status: upstream.status,
      // Returned as text because the shape is not documented; the caller
      // only needs to read a number off it.
      body: body.slice(0, 500),
    })
  } catch (error) {
    return response.status(200).json({
      configured: true,
      error: error.name === 'AbortError' ? 'timeout' : 'fetch_failed',
    })
  }
}
