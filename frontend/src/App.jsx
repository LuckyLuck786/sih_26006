import { useState } from 'react'

import Header from './components/Header'
import Footer from './components/Footer'
import InputPanel from './components/InputPanel'
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
import PipelineStrip from './components/PipelineStrip'
import StatusBar from './components/StatusBar'

import { analyzeShipment } from './services/api'
import { initialValues } from './lib/shipmentDefaults'
import { MODEL_METRICS } from './engine'
import fleet from './data/vessels.json'
import routes from './data/routes.json'

// Each tab is a lettered requirement of PS 26006, so the dashboard reads
// in the same order as the problem statement.
const TABS = [
  { id: 'decision', label: 'Decision' },
  { id: 'timing', label: 'Timing', note: 'a' },
  { id: 'vessel', label: 'Vessel', note: 'b' },
  { id: 'idle', label: 'Idle time', note: 'c' },
  { id: 'risk', label: 'Risk', note: 'd' },
  { id: 'contract', label: 'Contract' },
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

  const metrics = MODEL_METRICS?.metrics

  const headerMeta = [
    {
      label: 'Lane',
      value: result
        ? `${result.route.load_port_unlocode}/${result.route.discharge_port_unlocode}`
        : 'not set',
    },
    { label: 'Horizon', value: `${result?.forecast?.horizon_days ?? 14}d` },
    { label: 'Model MAE', value: metrics ? `$${metrics.model_mae}/t` : 'n/a' },
  ]

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <Header meta={headerMeta} />
      <StatusBar trace={result?.trace} fleetSize={fleet.length} laneCount={routes.length} />

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-7 lg:px-8">
        <div className="mb-6 max-w-2xl">
          <p className="label">East Coast India · Dry bulk · SIH PS 26006</p>
          <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-ink sm:text-[28px]">
            Charter entry timing, vessel selection and contract structure
          </h1>
          <p className="mt-2 text-[13px] leading-6 text-ink-muted">
            Enter a cargo parcel and lane. The desk returns when to fix, which vessel class the
            ports actually permit, what the voyage will idle, and whether to go spot or term.
          </p>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <InputPanel values={values} onChange={setValues} onSubmit={submit} loading={loading} />

          <section aria-live="polite" className="min-w-0">
            {loading ? (
              <LoadingState />
            ) : error ? (
              <ErrorState message={error} onRetry={retry} />
            ) : (
              <div className="space-y-3">
                <DecisionBanner
                  decision={result?.decision?.decision || ''}
                  reason={result?.decision?.reason || ''}
                  placeholder={!result}
                />

                {result ? (
                  <>
                    <nav className="rule flex gap-px border bg-rule">
                      {TABS.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setTab(item.id)}
                          aria-current={tab === item.id ? 'page' : undefined}
                          className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors ${
                            tab === item.id
                              ? 'bg-navy text-white'
                              : 'bg-surface text-ink-muted hover:bg-sunken hover:text-ink'
                          }`}
                        >
                          {item.label}
                          {item.note && (
                            <span
                              className={
                                tab === item.id ? 'ml-1 text-white/55' : 'ml-1 text-ink-faint'
                              }
                            >
                              ({item.note})
                            </span>
                          )}
                        </button>
                      ))}
                    </nav>

                    {tab === 'decision' && (
                      <div className="space-y-3">
                        <ResultCards result={result} />
                        <ForecastChart
                          series={result.forecast_series}
                          currentRate={result.forecast?.current_rate}
                          horizonDays={result.forecast?.horizon_days}
                        />
                        <PipelineStrip trace={result.trace} />
                        <ModelCard model={result.model} />
                      </div>
                    )}

                    {tab === 'timing' && (
                      <div className="space-y-3">
                        <OptimalTiming timing={result.optimal_timing} />
                        <ForecastChart
                          series={result.forecast_series}
                          currentRate={result.forecast?.current_rate}
                          horizonDays={result.forecast?.horizon_days}
                        />
                      </div>
                    )}

                    {tab === 'vessel' && (
                      <div className="space-y-3">
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
                ) : (
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

      <Footer />
    </div>
  )
}
