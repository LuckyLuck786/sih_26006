/**
 * USD to INR reference rate.
 *
 * Dry bulk freight is quoted in US dollars per tonne worldwide, so the
 * engine computes in USD. An Indian procurement desk budgets in rupees,
 * so every figure is also shown converted. The conversion is only
 * honest if the rate is current and its date is stated, which is what
 * this endpoint provides.
 *
 * Primary source is the European Central Bank reference rate via
 * Frankfurter; it publishes once per working day and carries that date.
 * open.er-api.com is the fallback. Both are keyless.
 *
 * Never fails the page: on any error it returns the pinned rate marked
 * as stale so the UI can say so rather than showing nothing.
 */

// Last known good rate, used only when both sources are unreachable.
const FALLBACK_RATE = 95.82
const FALLBACK_DATE = '2026-09-21'

const CACHE_TTL_MS = 6 * 60 * 60 * 1000
let cache = null

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(request, response) {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    response.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400')
    return response.status(200).json({ ...cache.payload, cached: true })
  }

  const ecb = await fetchJson('https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR')

  let payload = null

  if (Number.isFinite(ecb?.rates?.INR)) {
    payload = {
      rate: ecb.rates.INR,
      date: ecb.date,
      source: 'European Central Bank',
      stale: false,
    }
  } else {
    const open = await fetchJson('https://open.er-api.com/v6/latest/USD')

    if (Number.isFinite(open?.rates?.INR)) {
      payload = {
        rate: open.rates.INR,
        date: (open.time_last_update_utc || '').slice(5, 16),
        source: 'open.er-api.com',
        stale: false,
      }
    }
  }

  if (!payload) {
    payload = {
      rate: FALLBACK_RATE,
      date: FALLBACK_DATE,
      source: 'pinned fallback',
      stale: true,
    }
  }

  cache = { at: Date.now(), payload }

  response.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400')
  return response.status(200).json(payload)
}
