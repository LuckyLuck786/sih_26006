/**
 * Deterministic numerics.
 *
 * Math.random() would make every re-run of the same enquiry produce
 * different probabilities — exactly the bug the Python Monte Carlo had
 * before it was seeded. Every sampler here is driven by an explicit seed.
 */

export function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function gaussianSampler(seed) {
  const rand = mulberry32(seed)
  let spare = null

  return function normal(mean = 0, sigma = 1) {
    if (spare !== null) {
      const value = spare
      spare = null
      return mean + sigma * value
    }
    let u
    let v
    let s
    do {
      u = rand() * 2 - 1
      v = rand() * 2 - 1
      s = u * u + v * v
    } while (s === 0 || s >= 1)
    const factor = Math.sqrt((-2 * Math.log(s)) / s)
    spare = v * factor
    return mean + sigma * u * factor
  }
}

export function percentile(sorted, p) {
  if (!sorted.length) return 0
  const index = (sorted.length - 1) * p
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export const round = (value, dp = 0) => {
  const factor = 10 ** dp
  return Math.round(value * factor) / factor
}
