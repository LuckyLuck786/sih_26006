/**
 * Serverless proxy for Data Docked AIS lookups.
 *
 * Why this exists rather than calling Data Docked from the browser:
 *
 *   1. Any variable prefixed VITE_ is compiled into the public JavaScript
 *      bundle. Putting the key there would publish it, and this repository
 *      and its deployment are both public.
 *   2. The key belongs to a metered account. Keeping the call server-side
 *      means the quota cannot be drained by anyone who opens the page.
 *
 * The key is read from DATADOCKED_API_KEY, which is set in the Vercel
 * project's environment variables and never committed.
 *
 * This endpoint never fails the page: if the key is absent, the quota is
 * exhausted, or the upstream call errors, it responds 200 with
 * `source: "simulated"` and the caller falls back to the tracked fleet.
 */

const DATADOCKED_BASE = 'https://datadocked.com/api/vessels_operations'

// The free tier is metered, so identical lookups within this window are
// served from memory rather than spending another credit. Serverless
// instances are recycled, which makes this a best-effort cache.
const CACHE_TTL_MS = 10 * 60 * 1000
const cache = new Map()

export default async function handler(request, response) {
  const { latitude, longitude, radius = '50' } = request.query || {}

  const lat = Number(latitude)
  const lon = Number(longitude)
  const circleRadius = Math.min(Math.max(parseInt(radius, 10) || 50, 1), 500)

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return response.status(400).json({ error: 'latitude and longitude are required' })
  }

  const apiKey = process.env.DATADOCKED_API_KEY

  if (!apiKey) {
    return response.status(200).json({ source: 'simulated', reason: 'no_api_key', vessels: [] })
  }

  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)},${circleRadius}`
  const cached = cache.get(cacheKey)

  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return response.status(200).json({ ...cached.payload, cached: true })
  }

  try {
    const url = new URL(`${DATADOCKED_BASE}/get-vessels-by-area`)
    url.searchParams.set('latitude', String(lat))
    url.searchParams.set('longitude', String(lon))
    url.searchParams.set('circle_radius', String(circleRadius))

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)

    const upstream = await fetch(url, {
      headers: { accept: 'application/json', 'x-api-key': apiKey },
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!upstream.ok) {
      return response.status(200).json({
        source: 'simulated',
        reason: `upstream_${upstream.status}`,
        vessels: [],
      })
    }

    const data = await upstream.json()

    // The endpoint has returned a bare array and an object wrapper at
    // different times, so normalise both into a list.
    const vessels = Array.isArray(data) ? data : data?.data || data?.vessels || data?.results || []

    const payload = { source: 'live', vessels }

    cache.set(cacheKey, { at: Date.now(), payload })

    // Let the CDN hold it too, so repeat viewers cost nothing.
    response.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800')

    return response.status(200).json(payload)
  } catch (error) {
    return response.status(200).json({
      source: 'simulated',
      reason: error.name === 'AbortError' ? 'timeout' : 'fetch_failed',
      vessels: [],
    })
  }
}
