const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const money = (value) => value === undefined || value === null ? '—' : currency.format(Number(value))

function Card({ label, children, accent = '' }) {
  return <article className="min-h-32 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p><div className={`mt-3 ${accent}`}>{children}</div></article>
}

export default function ResultCards({ result }) {
  const forecast = result?.forecast || {}
  const decision = result?.decision || {}
  const vessel = result?.recommended_vessel || {}
  const confidence = typeof result?.confidence === 'number' ? Math.max(0, Math.min(1, result.confidence)) : null
  const risk = result?.risk || '—'
  const riskClass = risk === 'LOW' ? 'bg-emerald-100 text-emerald-800' : risk === 'HIGH' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
  const placeholder = !result

  return <div className="grid gap-4 sm:grid-cols-2">
    <Card label="Forecast range"><div className="flex items-end gap-3"><span className="text-sm text-slate-500">Best {money(forecast.best)}</span><strong className="text-xl text-slate-900">{money(forecast.expected)}</strong><span className="text-sm text-slate-500">Worst {money(forecast.worst)}</span></div><p className="mt-2 text-xs text-slate-400">Expected freight rate</p></Card>
    <Card label="Expected freight" accent="text-2xl font-black text-slate-900">{money(forecast.expected)}</Card>
    <Card label="Expected saving"><div className="text-lg font-black text-emerald-700">{money(decision.expected_saving)}</div><p className={`mt-2 text-sm font-semibold ${(decision.net_expected_saving ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{money(decision.net_expected_saving)} net after waiting cost</p></Card>
    <Card label="Confidence"><div className="flex items-center justify-between"><strong className="text-2xl font-black text-slate-900">{confidence === null ? '—' : `${Math.round(confidence * 100)}%`}</strong></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${(confidence || 0) * 100}%` }} /></div></Card>
    <Card label="Risk"><span className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${placeholder ? 'bg-slate-100 text-slate-400' : riskClass}`}>{risk}</span></Card>
    <Card label="Recommended vessel"><div className="flex items-start justify-between gap-3"><div><strong className="block text-lg font-black text-slate-900">{vessel.vessel || '—'}</strong><span className="text-sm text-slate-500">{vessel.type || 'Vessel class unavailable'}</span></div>{vessel.available !== undefined && <span className={`text-xs font-bold ${vessel.available ? 'text-emerald-600' : 'text-red-600'}`}>{vessel.available ? 'Available' : 'Unavailable'}</span>}</div><p className="mt-2 text-xs text-slate-400">{vessel.distance_nm ? `${vessel.distance_nm} nm from port` : 'Vessel routing pending'}</p></Card>
  </div>
}