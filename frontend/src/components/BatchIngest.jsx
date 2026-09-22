import { useRef, useState } from 'react'

import { SAMPLE_CSV, analyzeBatch, parseCsv, resultsToCsv } from '../engine/batch'
import { inrCrore, inrRate } from '../lib/inr'
import { useFx } from '../lib/currency'
import { money, rate, tonnes } from '../lib/format'
import { Panel, Pill } from './ui'

/**
 * Batch parcel ingestion.
 *
 * A planner holds a list of parcels for the quarter, not one cargo.
 * Drop the list in and every line gets the same full analysis, ranked,
 * with unservable lines flagged rather than dropped.
 *
 * Everything runs in the browser. The parcel list is never uploaded, and
 * that is a procurement schedule, so it should not be.
 */

function Summary({ label, value, tone = 'text-ink' }) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <p className="label">{label}</p>
      <p className={`num mt-1 text-lg font-semibold ${tone}`}>{value}</p>
    </div>
  )
}

export default function BatchIngest() {
  const fx = useFx()
  const inputRef = useRef(null)

  const [batch, setBatch] = useState(null)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [sourceName, setSourceName] = useState('')

  const run = (text, name) => {
    setError('')
    try {
      const { header, records } = parseCsv(text)

      if (!records.length) {
        setError('No data rows found. The first line must be a header.')
        return
      }

      const missing = ['origin', 'destination', 'cargo_quantity'].filter(
        (column) => !header.includes(column),
      )

      if (missing.length) {
        setError(`Missing required column(s): ${missing.join(', ')}. Found: ${header.join(', ')}`)
        return
      }

      const started = performance.now()
      const outcome = analyzeBatch(records)
      outcome.elapsed_ms = performance.now() - started

      setBatch(outcome)
      setSourceName(name)
    } catch (parseError) {
      setError(parseError.message)
    }
  }

  const readFile = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => run(String(reader.result), file.name)
    reader.onerror = () => setError('Could not read that file.')
    reader.readAsText(file)
  }

  const download = (text, filename) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const totals = batch?.totals

  return (
    <Panel
      eyebrow="Batch ingestion"
      title="Price a parcel list"
      subtitle="One full pipeline run per line, computed in this browser"
      right={
        totals ? (
          <Pill
            tone={totals.failed ? 'border-caution text-caution' : 'border-positive text-positive'}
          >
            {totals.priced}/{totals.parcels} priced in {batch.elapsed_ms.toFixed(0)} ms
          </Pill>
        ) : null
      }
    >
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          readFile(event.dataTransfer.files?.[0])
        }}
        className={`border border-dashed px-5 py-8 text-center transition-colors ${
          dragging ? 'border-navy bg-sunken' : 'border-rule-strong bg-surface'
        }`}
      >
        <p className="text-[13px] font-semibold text-ink">Drop a parcel list here</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-ink-muted">
          CSV with a header row. Required columns: <span className="num">origin</span>,{' '}
          <span className="num">destination</span>, <span className="num">cargo_quantity</span>.
          Optional: <span className="num">contract_duration</span>,{' '}
          <span className="num">vessel_class</span>,{' '}
          <span className="num">cargo_value_per_ton</span>, <span className="num">reference</span>.
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="border border-navy bg-navy px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-white transition-colors hover:bg-navy-soft"
          >
            Choose file
          </button>

          <button
            type="button"
            onClick={() => run(SAMPLE_CSV, 'sample-parcels.csv')}
            className="border border-rule-strong px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted transition-colors hover:border-navy hover:text-ink"
          >
            Run 8-parcel sample
          </button>

          <button
            type="button"
            onClick={() => download(SAMPLE_CSV, 'harborline-parcel-template.csv')}
            className="border border-rule-strong px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted transition-colors hover:border-navy hover:text-ink"
          >
            Download template
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

      {totals && (
        <>
          <div className="rule mt-4 grid grid-cols-2 gap-px border bg-rule md:grid-cols-3 xl:grid-cols-6">
            <Summary label="Parcels" value={totals.parcels} />
            <Summary label="Tonnage" value={tonnes(totals.tonnage)} />
            <Summary label="Programme cost" value={inrCrore(totals.total_cost_usd, fx.rate)} />
            <Summary label="Fix now" value={totals.charter_now} tone="text-caution" />
            <Summary label="Wait" value={totals.wait} tone="text-positive" />
            <Summary
              label="Elevated risk"
              value={totals.elevated_risk}
              tone={totals.elevated_risk ? 'text-negative' : 'text-positive'}
            />
          </div>

          <div className="-mx-1 mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="rule border-b text-left">
                  <th className="label py-2 pr-3">Reference</th>
                  <th className="label py-2 pr-3">Lane</th>
                  <th className="label py-2 pr-3 text-right">Parcel</th>
                  <th className="label py-2 pr-3">Class</th>
                  <th className="label py-2 pr-3 text-right">All-in /t</th>
                  <th className="label py-2 pr-3 text-right">Total</th>
                  <th className="label py-2 pr-3">Call</th>
                  <th className="label py-2">Risk</th>
                </tr>
              </thead>
              <tbody>
                {batch.results.map((row) => {
                  if (!row.ok) {
                    return (
                      <tr key={row.line} className="rule border-b">
                        <td className="num py-2 pr-3 text-ink">{row.reference}</td>
                        <td className="py-2 pr-3 text-xs text-ink-muted">
                          {row.origin} → {row.destination}
                        </td>
                        <td className="py-2 text-xs text-negative" colSpan={6}>
                          {row.reason}
                        </td>
                      </tr>
                    )
                  }

                  return (
                    <tr key={row.line} className="rule border-b">
                      <td className="num py-2 pr-3 font-medium text-ink">{row.reference}</td>

                      <td className="py-2 pr-3 text-xs text-ink-muted">
                        {row.load_port} → {row.destination}
                        <span className="block text-[10px] text-ink-faint">{row.origin}</span>
                      </td>

                      <td className="num py-2 pr-3 text-right text-ink-muted">
                        {tonnes(row.cargo_quantity)}
                      </td>

                      <td className="py-2 pr-3 text-xs text-ink">
                        {row.vessel_type}
                        <span className="num block text-[10px] text-ink-faint">
                          {row.voyages_required} voyage(s)
                        </span>
                      </td>

                      <td className="num py-2 pr-3 text-right text-ink">
                        {inrRate(row.cost_per_tonne_usd, fx.rate)}
                        <span className="block text-[10px] font-normal text-ink-faint">
                          {rate(row.cost_per_tonne_usd)}
                        </span>
                      </td>

                      <td className="num py-2 pr-3 text-right text-ink">
                        {inrCrore(row.total_cost_usd, fx.rate)}
                      </td>

                      <td className="py-2 pr-3">
                        <span
                          className={`text-xs font-semibold ${
                            row.decision === 'WAIT' ? 'text-positive' : 'text-caution'
                          }`}
                        >
                          {row.decision}
                        </span>
                        <span className="block text-[10px] text-ink-faint">{row.timing}</span>
                      </td>

                      <td className="py-2">
                        <Pill
                          tone={
                            row.risk === 'LOW'
                              ? 'border-positive text-positive'
                              : row.risk === 'MEDIUM'
                                ? 'border-caution text-caution'
                                : 'border-negative text-negative'
                          }
                        >
                          {row.risk}
                        </Pill>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4">
            <p className="text-[11px] text-ink-faint">
              {sourceName} · {totals.priced} priced, {totals.failed} failed ·{' '}
              {money(totals.total_cost_usd)} programme
            </p>
            <button
              type="button"
              onClick={() => download(resultsToCsv(batch.results), 'harborline-batch-results.csv')}
              className="border border-rule-strong px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted transition-colors hover:border-navy hover:text-ink"
            >
              Export results
            </button>
          </div>
        </>
      )}
    </Panel>
  )
}
