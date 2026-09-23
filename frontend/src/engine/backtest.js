/**
 * Backtest the forecasting approach on a real rate series.
 *
 * The shipped forecast is a LightGBM quantile model trained in Python on
 * a synthetic history. That is the weakest part of this project's
 * evidence, and the honest answer to it is to let a reviewer run the
 * same approach against a series they trust.
 *
 * What runs here is NOT LightGBM. Gradient boosting does not train in a
 * browser tab on a click. This is ridge regression over the same feature
 * set the Python pipeline builds — lags, rolling statistics and cyclical
 * seasonality — evaluated the same way: a date-ordered split, a 14-day
 * horizon, and a comparison against the naive persistence baseline that
 * any freight forecast has to beat to be worth anything.
 *
 * So it tests the approach and the feature design, not the exact model.
 * That distinction is stated in the UI rather than glossed.
 */

import SAMPLE from '../data/sample_series.json'

const HORIZON = 14
const RIDGE_LAMBDA = 1e-3
const TEST_FRACTION = 0.2

/** Parse a two-column date/rate series. Extra columns are ignored. */
export function parseSeries(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (!lines.length) return { rows: [], error: 'File is empty.' }

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))

  const dateIndex = header.findIndex((h) => ['date', 'day', 'timestamp'].includes(h))
  const rateIndex = header.findIndex((h) =>
    ['freight_rate', 'rate', 'value', 'close', 'index', 'price'].includes(h),
  )

  if (dateIndex === -1 || rateIndex === -1) {
    return {
      rows: [],
      error: `Need a date column (date/day/timestamp) and a rate column (freight_rate/rate/value/close/index/price). Found: ${header.join(', ')}`,
    }
  }

  const rows = []

  for (const line of lines.slice(1)) {
    const cells = line.split(',')
    const date = new Date((cells[dateIndex] || '').trim())
    const value = Number((cells[rateIndex] || '').replace(/[, ]/g, ''))
    if (!Number.isNaN(date.getTime()) && Number.isFinite(value)) {
      rows.push({ date, value })
    }
  }

  rows.sort((a, b) => a.date - b.date)

  if (rows.length < 120) {
    return {
      rows,
      error: `Need at least 120 observations to train and hold out a test period. Found ${rows.length}.`,
    }
  }

  return { rows, error: null }
}

/** Same feature family the Python preprocessor builds. */
function buildRows(series) {
  const value = series.map((r) => r.value)
  const out = []

  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length

  for (let t = 30; t < series.length - HORIZON; t += 1) {
    const window7 = value.slice(t - 7, t)
    const window14 = value.slice(t - 14, t)
    const window30 = value.slice(t - 30, t)

    const m7 = mean(window7)
    const sd7 = Math.sqrt(mean(window7.map((v) => (v - m7) ** 2)))

    const dayOfYear = (series[t].date - new Date(series[t].date.getFullYear(), 0, 0)) / 86400000

    out.push({
      date: series[t].date,
      current: value[t],
      features: [
        1,
        value[t],
        value[t - 1],
        value[t - 3],
        value[t - 7],
        value[t - 14],
        m7,
        mean(window14),
        mean(window30),
        sd7,
        Math.sin((2 * Math.PI * dayOfYear) / 365),
        Math.cos((2 * Math.PI * dayOfYear) / 365),
      ],
      target: value[t + HORIZON],
    })
  }

  return out
}

/** Ridge regression by normal equations. Twelve features, so this is trivial. */
function fitRidge(rows) {
  const p = rows[0].features.length
  const xtx = Array.from({ length: p }, () => new Float64Array(p))
  const xty = new Float64Array(p)

  for (const row of rows) {
    for (let i = 0; i < p; i += 1) {
      xty[i] += row.features[i] * row.target
      for (let j = 0; j < p; j += 1) xtx[i][j] += row.features[i] * row.features[j]
    }
  }

  // Regularise everything except the intercept.
  for (let i = 1; i < p; i += 1) xtx[i][i] += RIDGE_LAMBDA * rows.length

  // Gaussian elimination with partial pivoting.
  const a = xtx.map((row, i) => [...row, xty[i]])

  for (let col = 0; col < p; col += 1) {
    let pivot = col
    for (let r = col + 1; r < p; r += 1) {
      if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r
    }
    ;[a[col], a[pivot]] = [a[pivot], a[col]]

    if (Math.abs(a[col][col]) < 1e-12) continue

    for (let r = col + 1; r < p; r += 1) {
      const factor = a[r][col] / a[col][col]
      for (let c = col; c <= p; c += 1) a[r][c] -= factor * a[col][c]
    }
  }

  const beta = new Float64Array(p)
  for (let r = p - 1; r >= 0; r -= 1) {
    let acc = a[r][p]
    for (let c = r + 1; c < p; c += 1) acc -= a[r][c] * beta[c]
    beta[r] = Math.abs(a[r][r]) < 1e-12 ? 0 : acc / a[r][r]
  }

  return beta
}

const predict = (beta, features) => features.reduce((sum, f, i) => sum + f * beta[i], 0)

const quantile = (sorted, q) => {
  if (!sorted.length) return 0
  const index = (sorted.length - 1) * q
  const lo = Math.floor(index)
  const hi = Math.ceil(index)
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo)
}

/**
 * Train on the earlier portion, evaluate on the later one.
 *
 * Split by date, never by shuffled row, so the model cannot see the
 * future. Intervals come from the training residual distribution rather
 * than a separate quantile fit, which is a weaker construction than the
 * Python model's and is reported as such.
 */
export function backtest(series) {
  const rows = buildRows(series)

  if (rows.length < 40) {
    return { error: `Only ${rows.length} usable windows after feature construction. Need 40.` }
  }

  const cut = Math.floor(rows.length * (1 - TEST_FRACTION))
  const train = rows.slice(0, cut)
  const test = rows.slice(cut)

  // Interval by split conformal prediction.
  //
  // Two weaker constructions were tried first and both failed on the
  // shipped sample lane: quantiles of training residuals covered 59% of
  // a nominal 80% band because residuals on fitted data are too small,
  // and signed quantiles from a validation slice covered 41% because
  // that slice's own trend biased the offsets rather than widening them.
  //
  // Split conformal instead takes the 80th percentile of ABSOLUTE
  // residuals on a held-out calibration slice and bands the prediction
  // symmetrically by it. Under exchangeability that carries a
  // finite-sample coverage guarantee rather than a hope.
  const fitCut = Math.floor(train.length * 0.75)
  const fitRows = train.slice(0, fitCut)
  const calibrationRows = train.slice(fitCut)

  const calibrationBeta = fitRidge(fitRows)

  // Normalised (Mondrian) conformal score: the residual divided by the
  // local volatility the feature vector already carries. Plain conformal
  // assumes exchangeability, which a rate series with overlapping 14-day
  // windows violates; scaling by local volatility lets the band breathe
  // with the market instead of holding one width across the horizon.
  const VOL_INDEX = 9 // rolling 7-day standard deviation
  const volFloor = 1e-6

  const absoluteResiduals = calibrationRows
    .map(
      (row) =>
        Math.abs(row.target - predict(calibrationBeta, row.features)) /
        Math.max(row.features[VOL_INDEX], volFloor),
    )
    .sort((a, b) => a - b)

  // The conformal level includes the finite-sample correction.
  const n = absoluteResiduals.length
  const level = Math.min(Math.ceil((n + 1) * 0.8) / n, 1)
  const scoreQuantile = quantile(absoluteResiduals, level)

  // The reported model is refitted on all training rows.
  const beta = fitRidge(train)

  let modelAbs = 0
  let naiveAbs = 0
  let inside = 0

  const points = test.map((row) => {
    const predicted = predict(beta, row.features)
    const naive = row.current

    modelAbs += Math.abs(row.target - predicted)
    naiveAbs += Math.abs(row.target - naive)

    const halfBand = scoreQuantile * Math.max(row.features[VOL_INDEX], volFloor)
    const lower = predicted - halfBand
    const upper = predicted + halfBand
    if (row.target >= lower && row.target <= upper) inside += 1

    return {
      date: row.date.toISOString().slice(0, 10),
      actual: Number(row.target.toFixed(4)),
      predicted: Number(predicted.toFixed(4)),
      naive: Number(naive.toFixed(4)),
      lower: Number(lower.toFixed(4)),
      upper: Number(upper.toFixed(4)),
    }
  })

  const modelMae = modelAbs / test.length
  const naiveMae = naiveAbs / test.length

  return {
    error: null,
    horizon_days: HORIZON,
    observations: series.length,
    train_rows: train.length,
    test_rows: test.length,
    cutoff: train[train.length - 1].date.toISOString().slice(0, 10),
    model_mae: Number(modelMae.toFixed(4)),
    naive_mae: Number(naiveMae.toFixed(4)),
    improvement_pct: Number((((naiveMae - modelMae) / naiveMae) * 100).toFixed(2)),
    beats_naive: modelMae < naiveMae,
    coverage: Number((inside / test.length).toFixed(4)),
    score_quantile: Number(scoreQuantile.toFixed(4)),
    calibration_rows: n,
    points,
  }
}

/**
 * A lane from the shipped synthetic training history.
 *
 * Loaded rather than generated on the fly. An earlier version produced a
 * series here with a weak linear-congruential generator, and on it the
 * naive baseline beat the model by 82% — which said more about that
 * generator than about the approach. Serving a real lane from the data
 * the project actually trains on is both honest and a more useful first
 * thing for a reviewer to try.
 */
export function sampleSeries() {
  return SAMPLE.rows.map((row) => ({ date: new Date(row.date), value: row.value }))
}

export const SAMPLE_LABEL = `${SAMPLE.label} (${SAMPLE.rows.length} days, synthetic)`
