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

/**
 * Forecast curve with the Q10-Q90 band.
 *
 * Rates are US dollars per tonne. The previous version formatted the axis
 * as Indian rupees in thousands, which mislabelled the model's output and
 * rendered every tick as "₹0k" once the values became per-tonne figures.
 */
export default function ForecastChart({ series = [], currentRate, horizonDays = 14 }) {
  const data = Array.isArray(series)
    ? series.map((point) => ({
        ...point,
        base: point.lower || 0,
        band: Math.max(0, (point.upper || 0) - (point.lower || 0)),
      }))
    : []

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-teal-700">
            Rate outlook
          </p>
          <h2 className="font-display mt-1 text-xl font-bold text-slate-900">Freight forecast</h2>
        </div>
        <p className="text-xs text-slate-400">{horizonDays}-day planning window · US$ per tonne</p>
      </div>

      {data.length === 0 ? (
        <div className="grid h-64 place-items-center text-sm text-slate-400">
          Forecast data will appear after analysis.
        </div>
      ) : (
        <div className="mt-5 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 12, left: 6, bottom: 8 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                label={{
                  value: 'Day',
                  position: 'insideBottom',
                  offset: -4,
                  fill: '#64748b',
                  fontSize: 12,
                }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={58}
                tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
                domain={['dataMin - 1', 'dataMax + 1']}
                label={{
                  value: 'US$ / tonne',
                  angle: -90,
                  position: 'insideLeft',
                  fill: '#64748b',
                  fontSize: 12,
                }}
              />
              <Tooltip
                formatter={(value, name) => [
                  rate(value),
                  name === 'expected' ? 'Expected' : name === 'band' ? 'Q10–Q90 band' : name,
                ]}
                labelFormatter={(day) => `Day ${day}`}
              />
              <Area
                type="monotone"
                dataKey="base"
                stackId="range"
                stroke="none"
                fill="transparent"
              />
              <Area
                type="monotone"
                dataKey="band"
                stackId="range"
                stroke="none"
                fill="#99f6e4"
                fillOpacity={0.55}
              />
              <Line
                type="monotone"
                dataKey="expected"
                stroke="#0f766e"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5, fill: '#0f766e' }}
              />
              {typeof currentRate === 'number' && (
                <ReferenceLine
                  y={currentRate}
                  stroke="#f59e0b"
                  strokeDasharray="6 5"
                  label={{
                    value: 'Rate today',
                    position: 'insideTopRight',
                    fill: '#b45309',
                    fontSize: 12,
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
