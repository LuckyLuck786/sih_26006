import { useState } from 'react'

import Header from './components/Header'
import InputPanel, { initialValues } from './components/InputPanel'
import ResultCards from './components/ResultCards'
import DecisionBanner from './components/DecisionBanner'
import ForecastChart from './components/ForecastChart'
import LoadingState from './components/LoadingState'
import ErrorState from './components/ErrorState'

import OptimalTiming from './components/OptimalTiming'
import VesselRanking from './components/VesselRanking'
import IdlePanel from './components/IdlePanel'
import ContractStrategy from './components/ContractStrategy'
import RiskAlerts from './components/RiskAlerts'
import VoyageMap from './components/VoyageMap'
import ModelCard from './components/ModelCard'

import { analyzeShipment } from './services/api'

// Each tab maps to a lettered requirement of PS 26006, so the structure
// of the dashboard mirrors the structure of the problem statement.
const TABS = [
  { id: 'decision', label: 'Decision', hint: 'Forecast & charter call' },
  { id: 'timing', label: 'Timing', hint: 'Requirement (a)' },
  { id: 'vessel', label: 'Vessel', hint: 'Requirement (b)' },
  { id: 'idle', label: 'Idle time', hint: 'Requirement (c)' },
  { id: 'risk', label: 'Risk', hint: 'Requirement (d)' },
  { id: 'contract', label: 'Contract', hint: 'Spot vs term' },
]

export default function App() {
  const [values, setValues] = useState(initialValues)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastPayload, setLastPayload] = useState(null)
  const [tab, setTab] = useState('decision')

  const submit = async (formValues) => {
    setLoading(true)
    setError('')

    const payload = Object.fromEntries(
      Object.entries(formValues).map(([key, value]) => [
        key,
        Number.isNaN(Number(value)) || value === '' ? value : Number(value),
      ]),
    )

    setLastPayload(payload)

    try {
      setResult(await analyzeShipment(payload))
      setTab('decision')
    } catch (requestError) {
      setResult(null)
      setError(requestError.message || 'Unable to analyze this shipment.')
    } finally {
      setLoading(false)
    }
  }

  const retry = () => lastPayload && submit(lastPayload)

  const decision = result?.decision?.decision || ''
  const reason = result?.decision?.reason || ''

  return (
    <div className="min-h-screen bg-[#f3f7f8] text-slate-900">
      <Header />

      <main className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-10">
        <div className="mb-8 max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700">
            East Coast India · Dry bulk · SIH PS 26006
          </p>
          <h1 className="font-display mt-2 text-4xl font-black tracking-tight text-[#071b2a] sm:text-5xl">
            Make the next charter count.
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-600">
            Turn live shipment assumptions into a clear, defensible freight decision — when to fix,
            which vessel class, and whether to go spot or term.
          </p>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(300px,1fr)_minmax(0,2.3fr)]">
          <InputPanel
            values={values}
            onChange={setValues}
            onSubmit={submit}
            loading={loading}
          />

          <section aria-live="polite" className="min-w-0">
            {loading ? (
              <LoadingState />
            ) : error ? (
              <ErrorState message={error} onRetry={retry} />
            ) : (
              <div className="space-y-4">
                <DecisionBanner decision={decision} reason={reason} placeholder={!result} />

                {result && (
                  <>
                    {/* Tabs only appear once there is something to show, so
                        the empty state stays as simple as it was before. */}
                    <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
                      {TABS.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setTab(item.id)}
                          title={item.hint}
                          className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-bold transition ${
                            tab === item.id
                              ? 'bg-teal-600 text-white shadow'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </nav>

                    {tab === 'decision' && (
                      <div className="space-y-4">
                        <ResultCards result={result} />
                        <ForecastChart
                          series={result.forecast_series}
                          currentRate={result.forecast?.current_rate}
                          horizonDays={result.forecast?.horizon_days}
                        />
                        <ModelCard model={result.model} />
                      </div>
                    )}

                    {tab === 'timing' && (
                      <div className="space-y-4">
                        <OptimalTiming timing={result.optimal_timing} />
                        <ForecastChart
                          series={result.forecast_series}
                          currentRate={result.forecast?.current_rate}
                          horizonDays={result.forecast?.horizon_days}
                        />
                      </div>
                    )}

                    {tab === 'vessel' && (
                      <div className="space-y-4">
                        <VesselRanking
                          recommendation={result.vessel_recommendation}
                          route={result.route}
                        />
                        <VoyageMap route={result.route} fleet={result.fleet} />
                      </div>
                    )}

                    {tab === 'idle' && <IdlePanel idle={result.idle} />}

                    {tab === 'risk' && <RiskAlerts risk={result.risk} />}

                    {tab === 'contract' && <ContractStrategy contract={result.contract_strategy} />}
                  </>
                )}

                {!result && (
                  <>
                    <ResultCards result={null} />
                    <ForecastChart series={[]} />
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
