import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { rate } from '../lib/format'
import { useTheme } from '../lib/theme'

/** Resolve a design token to its current computed value. */
function token(name, fallback) {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

/**
 * Forecast curve with the Q10-Q90 band.
 *
 * The band is NOT drawn as two stacked areas. That is the usual trick,
 * but the stack baseline is zero and Recharts widens any domain you give
 * it to fit every value on the axis, so the axis ran 0 to 25 and a $22/t
 * rate sat pinned to the top of the plot.
 *
 * Instead the upper bound is filled from the axis floor and the region
 * below the lower bound is masked with the surface colour. Only `lower`
 * and `upper` reach the axis, so the domain is the band itself.
 */
export default function ForecastChart({ series = [], currentRate, horizonDays = 14 }) {
  // Re-read on theme change so the chart follows the tokens.
  const { theme } = useTheme()

  const ink = token('--color-navy', '#10243a')
  const faint = token('--color-ink-faint', '#8b929c')
  const rule = token('--color-rule', '#ddd9d0')
  const surface = token('--color-surface', '#fffdf8')
  const negative = token('--color-negative', '#97272c')
  void theme

  const points = Array.isArray(series) ? series : []

  const data = points.map((point) => ({ ...point }))

  const values = data.flatMap((d) => [d.lower, d.upper]).filter((v) => Number.isFinite(v))

  if (Number.isFinite(currentRate)) values.push(currentRate)

  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 1

  // Pad by a tenth of the band's own height so extremes are not flush
  // against the plot edge.
  const pad = Math.max((max - min) * 0.12, 0.25)

  const domain = [Number((min - pad).toFixed(2)), Number((max + pad).toFixed(2))]

  return (
    <section className="rule border bg-surface">
      <header className="rule flex flex-wrap items-end justify-between gap-2 border-b bg-sunken px-4 py-3">
        <div>
          <p className="label">Rate outlook</p>
          <h3 className="mt-1 text-[15px] font-semibold leading-tight text-ink">
            Freight forecast
          </h3>
        </div>
        <p className="text-[11px] text-ink-faint">{horizonDays}-day window, US$ per tonne</p>
      </header>

      {data.length === 0 ? (
        <div className="grid h-56 place-items-center text-xs text-ink-faint">
          Forecast appears after analysis.
        </div>
      ) : (
        <div className="h-64 w-full px-2 py-3">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid stroke={rule} strokeDasharray="2 3" vertical={false} />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={{ stroke: rule }}
                tick={{ fill: faint, fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                interval="preserveStartEnd"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={52}
                domain={domain}
                allowDataOverflow
                tick={{ fill: faint, fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
              />
              <Tooltip
                cursor={{ stroke: faint, strokeDasharray: '2 3' }}
                contentStyle={{
                  border: `1px solid ${rule}`,
                  background: surface,
                  color: 'inherit',
                  borderRadius: 2,
                  fontSize: 12,
                  fontFamily: 'IBM Plex Mono',
                  boxShadow: 'none',
                }}
                formatter={(value, name) => [
                  rate(value),
                  name === 'expected' ? 'Expected' : name === 'upper' ? 'Q90' : 'Q10',
                ]}
                labelFormatter={(day) => `Day ${day}`}
              />
              {/* Upper bound filled to the floor, then everything below
                  the lower bound painted back out in the surface colour.
                  What remains visible is exactly the Q10-Q90 band. */}
              <Area
                type="monotone"
                dataKey="upper"
                stroke="none"
                fill={ink}
                fillOpacity={0.1}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="lower"
                stroke="none"
                fill={surface}
                fillOpacity={1}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="expected"
                stroke={ink}
                strokeWidth={1.75}
                dot={false}
                activeDot={{ r: 3, fill: ink }}
                isAnimationActive={false}
              />
              {Number.isFinite(currentRate) && (
                <ReferenceLine
                  y={currentRate}
                  stroke={negative}
                  strokeDasharray="3 3"
                  strokeWidth={1}
                  label={{
                    value: 'rate today',
                    position: 'insideTopLeft',
                    fill: negative,
                    fontSize: 10,
                  }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
