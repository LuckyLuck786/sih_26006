import { money, rate, percent } from '../lib/format'
import { Panel, Pill } from './ui'

/**
 * The stated Objective of PS 26006:
 *
 *   "moving from multiple single spot contracts being entered into
 *    currently to short term / medium term multiple voyage contracts"
 *
 * The first prototype collected a contract duration and never used it.
 */
export default function ContractStrategy({ contract }) {
  if (!contract) return null

  const pickTerm = contract.recommendation === 'TERM'

  const options = [
    {
      key: 'SPOT',
      title: `${contract.voyages_required} spot fixtures`,
      expected: contract.spot_expected_cost_usd,
      worst: contract.spot_worst_case_usd,
      best: contract.spot_best_case_usd,
      note: 'Exposed to every rate move between now and the last fixture',
    },
    {
      key: 'TERM',
      title: `${contract.contract_days}-day term contract`,
      expected: contract.term_total_cost_usd,
      worst: contract.term_total_cost_usd,
      best: contract.term_total_cost_usd,
      note: `One fixed rate of ${rate(contract.term_rate_per_tonne)}/t, ${contract.term_premium_pct}% over expected spot`,
    },
  ]

  const scale = Math.max(contract.spot_worst_case_usd, contract.term_total_cost_usd, 1)

  return (
    <Panel
      eyebrow="Objective · Spot versus term"
      title={pickTerm ? 'Fix a term contract' : 'Stay on spot'}
      subtitle="Risk-adjusted comparison across the contract period"
      right={
        <Pill tone={pickTerm ? 'bg-indigo-100 text-indigo-800' : 'bg-teal-100 text-teal-800'}>
          {contract.recommendation}
        </Pill>
      }
    >
      <div className="space-y-4">
        {options.map((option) => {
          const chosen = option.key === contract.recommendation
          return (
            <div
              key={option.key}
              className={`rounded-xl border p-4 ${chosen ? 'border-teal-400 bg-teal-50/60' : 'border-slate-200 bg-white'}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <strong className="text-sm font-bold text-slate-900">{option.title}</strong>
                <span className="text-lg font-black text-slate-900">{money(option.expected)}</span>
              </div>

              {/* Range bar: where the outcome can land. A term deal is a
                  single point because the rate is fixed. */}
              <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`absolute h-full rounded-full ${chosen ? 'bg-teal-500' : 'bg-slate-300'}`}
                  style={{
                    left: `${(option.best / scale) * 100}%`,
                    width: `${Math.max(((option.worst - option.best) / scale) * 100, 1.5)}%`,
                  }}
                />
              </div>

              <div className="mt-2 flex justify-between text-[11px] text-slate-500">
                <span>{money(option.best)} best</span>
                <span>{money(option.worst)} worst</span>
              </div>

              <p className="mt-2 text-xs leading-5 text-slate-500">{option.note}</p>
            </div>
          )
        })}
      </div>

      <div className="mt-5 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
            Term cheaper in
          </p>
          <p className="mt-1 text-lg font-black text-slate-900">
            {percent(contract.probability_term_cheaper)}
          </p>
          <p className="text-xs text-slate-400">of simulated markets</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
            Spot tail risk
          </p>
          <p className="mt-1 text-lg font-black text-slate-900">
            {money(contract.spot_cvar80_cost_usd)}
          </p>
          <p className="text-xs text-slate-400">mean of the worst 20%</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
            Certainty gain
          </p>
          <p
            className={`mt-1 text-lg font-black ${contract.cost_certainty_gain_usd >= 0 ? 'text-emerald-700' : 'text-slate-900'}`}
          >
            {money(contract.cost_certainty_gain_usd)}
          </p>
          <p className="text-xs text-slate-400">worst-case spot minus term</p>
        </div>
      </div>

      <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
        {contract.rationale}
      </p>
    </Panel>
  )
}
