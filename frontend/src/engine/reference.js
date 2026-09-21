/**
 * Reference data and lane resolution.
 *
 * `forecasts.json` holds the trained LightGBM quantile models' actual
 * output for every lane and vessel class, exported by
 * `ml/export_frontend_data.py`.
 */

import forecasts from '../data/forecasts.json'
import ports from '../data/ports.json'
import vesselClasses from '../data/vessel_classes.json'
import routes from '../data/routes.json'
import fleetData from '../data/vessels.json'
import modelMetrics from '../data/model_metrics.json'

import { round } from './math'

export const PORTS_BY_NAME = Object.fromEntries(ports.map((p) => [p.port, p]))

export const ORIGINS = [
  ...new Set(ports.filter((p) => p.role === 'load').map((p) => p.country)),
].sort()

export const DESTINATIONS = ports.filter((p) => p.role === 'discharge').map((p) => p.port)

export const VESSEL_CLASSES = vesselClasses

export const MODEL_METRICS = modelMetrics

export const FLEET = fleetData

export function resolveRoute(origin, destination) {
  const candidates = routes.filter(
    (r) => r.destination === destination && (r.origin === origin || r.origin_country === origin),
  )
  if (!candidates.length) return null
  return candidates.reduce((best, r) => (r.distance < best.distance ? r : best))
}

export function lookupForecast(originCountry, destination, vesselType) {
  return (
    forecasts[`${originCountry}|${destination}|${vesselType}`] ||
    forecasts[`${originCountry}|${destination}|Panamax`] ||
    null
  )
}

/** Expand the horizon quantiles into a daily curve, as the Python service does. */
export function buildSeries(currentRate, expected, best, worst, horizonDays) {
  const halfBandAtHorizon = Math.max((worst - best) / 2, 1e-9)
  const series = []
  for (let day = 0; day <= horizonDays; day += 1) {
    const progress = horizonDays ? day / horizonDays : 1
    const value = currentRate + (expected - currentRate) * progress
    const halfBand = halfBandAtHorizon * Math.sqrt(progress)
    series.push({
      day,
      expected: round(value, 2),
      lower: round(Math.max(value - halfBand, 0), 2),
      upper: round(value + halfBand, 2),
    })
  }
  return series
}
