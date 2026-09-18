import { useState } from 'react'
import Header from './components/Header'
import InputPanel, { initialValues } from './components/InputPanel'
import ResultCards from './components/ResultCards'
import DecisionBanner from './components/DecisionBanner'
import ForecastChart from './components/ForecastChart'
import LoadingState from './components/LoadingState'
import ErrorState from './components/ErrorState'
import { analyzeShipment } from './services/api'

export default function App() {
  const [values, setValues] = useState(initialValues)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastPayload, setLastPayload] = useState(null)

  const submit = async (formValues) => {
    setLoading(true)
    setError('')
    const payload = Object.fromEntries(Object.entries(formValues).map(([key, value]) => [key, Number.isNaN(Number(value)) || value === '' ? value : Number(value)]))
    setLastPayload(payload)
    try {
      setResult(await analyzeShipment(payload))
    } catch (requestError) {
      setError(requestError.message || 'Unable to analyze this shipment.')
    } finally {
      setLoading(false)
    }
  }

  const retry = () => lastPayload && submit(lastPayload)
  const decision = result?.decision?.decision || ''
  const reason = result?.decision?.reason || ''

  return <div className="min-h-screen bg-[#f3f7f8] text-slate-900"><Header /><main className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-10"><div className="mb-8 max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700">East Coast India · Dry bulk</p><h1 className="font-display mt-2 text-4xl font-black tracking-tight text-[#071b2a] sm:text-5xl">Make the next charter count.</h1><p className="mt-3 text-base leading-7 text-slate-600">Turn live shipment assumptions into a clear, defensible freight decision.</p></div><div className="grid items-start gap-6 lg:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)]"><InputPanel values={values} onChange={setValues} onSubmit={submit} loading={loading} /><section aria-live="polite" className="min-w-0">{loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={retry} /> : <div className="space-y-4"><DecisionBanner decision={decision} reason={reason} placeholder={!result} /><ResultCards result={result} /><ForecastChart series={result?.forecast_series || []} currentRate={result?.decision?.current_rate} /></div>}</section></div></main></div>
}