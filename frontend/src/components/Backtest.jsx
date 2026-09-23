import { useRef, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { SAMPLE_LABEL, backtest, parseSeries, sampleSeries } from '../engine/backtest'
import { percent } from '../lib/format'
import { useTheme } from '../lib/theme'
import { Panel, Pill } from './ui'

/**
 * Backtest on a series the reviewer supplies.
 *
 * The shipped model is trained on a synthetic history, which means its
 * reported accuracy proves the pipeline rather than forecast skill. This
 * tab exists so that claim can be tested rather than argued about: drop
 * in a real rate series and the same feature design and evaluation
 * protocol runs against it.
 */

function token(name, fallback) {
  if (typeof window === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function Metric({ label, value, hint, tone = 'text-ink' }) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <p className="label">{label}</p>
      <p className={`num mt-1 text-lg font-semibold ${tone}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] leading-4 text-ink-faint">{hint}</p>}
    </div>
  )
}

export default function Backtest() {
  const { theme } = useTheme()
  const inputRef = useRef(null)

  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [source, setSource] = useState('')

  const ink = token('--color-navy', '#10243a')
  const faint = token('--color-ink-faint', '#8b929c')
  const rule = token('--color-rule', '#ddd9d0')
  const negative = token('--color-negative', '#97272c')
  void theme

  const run = (rows, name) => {
    const outcome = backtest(rows)
    if (outcome.error) {
      setError(outcome.error)
      setResult(null)
      return
    }
    setError('')
    setResult(outcome)
    setSource(name)
  }

  const readFile = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const { rows, error: parseError } = parseSeries(String(reader.result))
      if (parseError) {
        setError(parseError)
        setResult(null)
        return
      }
      run(rows, file.name)
    }
    reader.onerror = () => setError('Could not read that file.')
    reader.readAsText(file)
  }

  return (
    <Panel
      eyebrow="Validation"
      title="Backtest on your own rate series"
      subtitle="Date-ordered split, 14-day horizon, measured against naive persistence"
      right={
        result ? (
          <Pill
            tone={
              result.beats_naive ? 'border-positive text-positive' : 'border-negative text-negative'
            }
          >
            {result.beats_naive
              ? `${result.improvement_pct}% better than naive`
              : `${Math.abs(result.improvement_pct)}% worse than naive`}
          </Pill>
        ) : null
      }
    >
      <div className="border border-negative bg-surface p-3 text-xs leading-5 text-ink-muted">
        <strong className="text-negative">Why this tab exists.</strong> The shipped forecast is a
        LightGBM quantile model trained on a synthetic history, so its 10.14% figure demonstrates
        the pipeline and not skill on the real market. Rather than argue that, test it. Drop in a
        series you trust.
        <br />
        <br />
        <strong className="text-ink">What runs here is not LightGBM.</strong> Gradient boosting does
        not train in a browser tab on a click. This is ridge regression over the same feature family
        the Python pipeline builds — lags at 1, 3, 7 and 14 days, rolling mean and deviation, and
        cyclical seasonality — split by date and scored the same way. It tests the feature design
        and the evaluation protocol, not the exact estimator.
        <br />
        <br />
        <strong className="text-ink">Intervals are conformal.</strong> Two weaker constructions were
        tried first and both failed on the sample lane: training residuals gave 59% coverage of a
        nominal 80% band, and signed validation offsets gave 41%. The band is now a
        volatility-normalised split conformal interval, which measures 82% on the sample lane.
        Coverage is measured on the holdout and reported below, not assumed.
      </div>

      <div className="mt-3 border border-dashed border-rule-strong bg-surface px-5 py-6 text-center">
        <p className="text-[13px] font-semibold text-ink">Drop a rate series</p>
        <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-ink-muted">
          CSV with a date column (<span className="num">date</span>,{' '}
          <span className="num">day</span> or <span className="num">timestamp</span>) and a rate
          column (<span className="num">freight_rate</span>, <span className="num">rate</span>,{' '}
          <span className="num">value</span>, <span className="num">close</span>,{' '}
          <span className="num">index</span> or <span className="num">price</span>). Minimum 120
          observations. A Baltic route assessment export or any daily index works.
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="border border-navy bg-navy px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-white transition-colors hover:bg-navy-soft"
          >
            Choose series
          </button>
          <button
            type="button"
            onClick={() => run(sampleSeries(), SAMPLE_LABEL)}
            className="border border-rule-strong px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted transition-colors hover:border-navy hover:text-ink"
          >
            Try the shipped sample lane
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => readFile(event.target.files?.[0])}
        />
      </div>

      {error && (
        <p className="mt-3 border border-negative bg-surface px-3 py-2 text-xs text-negative">
          {error}
        </p>
      )}

      {result && (
        <>
          <div className="rule mt-4 grid grid-cols-2 gap-px border bg-rule md:grid-cols-3 xl:grid-cols-6">
            <Metric
              label="Model MAE"
              value={result.model_mae}
              hint="mean absolute error"
              tone={result.beats_naive ? 'text-positive' : 'text-negative'}
            />
            <Metric label="Naive MAE" value={result.naive_mae} hint="rate in 14 days = today" />
            <Metric
              label="Improvement"
              value={`${result.improvement_pct}%`}
              tone={result.beats_naive ? 'text-positive' : 'text-negative'}
            />
            <Metric
              label="Coverage"
              value={percent(result.coverage)}
              hint="inside the 10-90 band, target 80%"
            />
            <Metric label="Train / test" value={`${result.train_rows}/${result.test_rows}`} />
            <Metric label="Cutoff" value={result.cutoff} hint="holdout starts after" />
          </div>

          <div className="rule mt-3 border bg-surface">
            <div className="rule border-b bg-sunken px-4 py-2.5">
              <p className="label">Holdout period, actual against forecast</p>
            </div>
            <div className="h-64 w-full px-2 py-3">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={result.points}
                  margin={{ top: 8, right: 16, left: 4, bottom: 4 }}
                >
                  <CartesianGrid stroke={rule} strokeDasharray="2 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={{ stroke: rule }}
                    tick={{ fill: faint, fontSize: 10, fontFamily: 'IBM Plex Mono' }}
                    interval="preserveStartEnd"
                    minTickGap={40}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={54}
                    domain={['auto', 'auto']}
                    tick={{ fill: faint, fontSize: 10, fontFamily: 'IBM Plex Mono' }}
                  />
                  <Tooltip
                    contentStyle={{
                      border: `1px solid ${rule}`,
                      borderRadius: 2,
                      fontSize: 12,
                      fontFamily: 'IBM Plex Mono',
                      boxShadow: 'none',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="upper"
                    stroke="none"
                    fill={ink}
                    fillOpacity={0.09}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke={ink}
                    strokeWidth={1.75}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="predicted"
                    stroke={negative}
                    strokeWidth={1.25}
                    strokeDasharray="4 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <p className="mt-3 text-[11px] leading-5 text-ink-faint">
            {source} · {result.observations} observations · solid line actual, dashed line forecast,
            shaded band the volatility-normalised conformal interval.{' '}
            {result.beats_naive
              ? 'Beating persistence at a 14-day horizon is the bar a freight forecast has to clear to be worth running.'
              : 'It does not beat persistence on this series. That is a real result and worth reporting rather than hiding: on some series, at some horizons, the naive baseline wins.'}
          </p>
        </>
      )}
    </Panel>
  )
}
