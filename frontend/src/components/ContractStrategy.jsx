import { percent, rate } from '../lib/format'
import { inrCrore, inrRate } from '../lib/inr'
import { useFx } from '../lib/currency'
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
  const fx = useFx()

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
      note: `One fixed rate of ${inrRate(contract.term_rate_per_tonne, fx.rate)}/t (${rate(contract.term_rate_per_tonne)}), ${contract.term_premium_pct}% over expected spot`,
    },
  ]

  const scale = Math.max(contract.spot_worst_case_usd, contract.term_total_cost_usd, 1)

  return (
    <Panel
      eyebrow="Objective · Spot versus term"
      title={pickTerm ? 'Fix a term contract' : 'Stay on spot'}
      subtitle="Risk-adjusted comparison across the contract period"
      right={
        <Pill tone={pickTerm ? 'bg-sunken text-navy' : 'bg-sunken text-navy'}>
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
              className={` border p-4 ${chosen ? 'border-navy bg-sunken' : 'border-rule bg-surface'}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <strong className="text-sm font-bold text-ink">{option.title}</strong>
                <span className="num text-lg font-semibold text-ink">
                  {inrCrore(option.expected, fx.rate)}
                </span>
              </div>

              {/* Range bar: where the outcome can land. A term deal is a
                  single point because the rate is fixed. */}
              <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-sunken">
                <div
                  className={`absolute h-full rounded-full ${chosen ? 'bg-navy' : 'bg-rule-strong'}`}
                  style={{
                    left: `${(option.best / scale) * 100}%`,
                    width: `${Math.max(((option.worst - option.best) / scale) * 100, 1.5)}%`,
                  }}
                />
              </div>

              <div className="mt-2 flex justify-between text-[11px] text-ink-muted">
                <span className="num">{inrCrore(option.best, fx.rate)} best</span>
                <span className="num">{inrCrore(option.worst, fx.rate)} worst</span>
              </div>

              <p className="mt-2 text-xs leading-5 text-ink-muted">{option.note}</p>
            </div>
          )
        })}
      </div>

      <div className="mt-5 grid gap-4 border-t border-rule pt-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink-muted">
            Term cheaper in
          </p>
          <p className="mt-1 text-lg font-black text-ink">
            {percent(contract.probability_term_cheaper)}
          </p>
          <p className="text-xs text-ink-faint">of simulated markets</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink-muted">
            Spot tail risk
          </p>
          <p className="num mt-1 text-lg font-semibold text-ink">
            {inrCrore(contract.spot_cvar80_cost_usd, fx.rate)}
          </p>
          <p className="text-xs text-ink-faint">mean of the worst 20%</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink-muted">
            Certainty gain
          </p>
          <p
            className={`mt-1 text-lg font-black ${contract.cost_certainty_gain_usd >= 0 ? 'text-positive' : 'text-ink'}`}
          >
            {inrCrore(contract.cost_certainty_gain_usd, fx.rate)}
          </p>
          <p className="text-xs text-ink-faint">worst-case spot minus term</p>
        </div>
      </div>

      <p className="mt-4 bg-sunken p-3 text-xs leading-5 text-ink-muted">{contract.rationale}</p>
    </Panel>
  )
}
