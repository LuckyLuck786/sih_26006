import { useState } from 'react'

import { ALTERNATIVES, ASSUMPTIONS, DATA_SOURCES, REFERENCES } from '../lib/provenance'
import { Panel, Pill } from './ui'

/**
 * Where the numbers come from.
 *
 * The problem statement asks for a defensible decision. Defensible means
 * a reviewer can trace any figure to a measurement, an assumption with a
 * stated basis, or a generated series that is labelled as one.
 *
 * The synthetic rate history is named first and plainly, because it is
 * the weakest part of the evidence base and a reviewer should hear it
 * from us rather than find it.
 */

const STATUS_TONE = {
  live: 'border-positive text-positive',
  reference: 'border-navy text-navy',
  approximated: 'border-caution text-caution',
  synthetic: 'border-negative text-negative',
  'live-optional': 'border-caution text-caution',
}

const SECTIONS = [
  { id: 'data', label: 'Data' },
  { id: 'assumptions', label: 'Assumptions' },
  { id: 'alternatives', label: 'Alternatives' },
  { id: 'references', label: 'References' },
]

export default function Provenance() {
  const [section, setSection] = useState('data')

  const synthetic = DATA_SOURCES.filter((s) => s.status === 'synthetic').length

  return (
    <Panel
      eyebrow="Provenance"
      title="Where every number comes from"
      subtitle="Measured, assumed, approximated or generated, stated per dataset"
      right={
        <Pill tone={synthetic ? 'border-negative text-negative' : 'border-positive text-positive'}>
          {synthetic} synthetic source{synthetic === 1 ? '' : 's'}
        </Pill>
      }
    >
      <div className="rule flex flex-wrap gap-px border bg-rule">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSection(item.id)}
            aria-pressed={section === item.id}
            className={`flex-1 px-3 py-1.5 text-xs font-semibold transition-colors ${
              section === item.id
                ? 'bg-navy text-white'
                : 'bg-surface text-ink-muted hover:bg-sunken hover:text-ink'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {section === 'data' && (
        <>
          <p className="mt-4 border border-negative bg-surface p-3 text-xs leading-5 text-ink-muted">
            <strong className="text-negative">Read this first.</strong> The freight rate history is
            synthetic. Forecast accuracy is therefore measured against a process this project wrote,
            which demonstrates the pipeline but does not prove skill on the real market. The
            Backtest tab exists so you can test it on a real series instead.
          </p>

          <dl className="mt-3 space-y-px bg-rule">
            {DATA_SOURCES.map((source) => (
              <div key={source.dataset} className="bg-surface px-4 py-3">
                <dt className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-ink">{source.dataset}</span>
                  <Pill tone={STATUS_TONE[source.status]}>{source.status}</Pill>
                </dt>
                <dd className="mt-1.5 space-y-1 text-[11px] leading-5 text-ink-muted">
                  <p>{source.detail}</p>
                  <p>
                    <span className="label">Why </span>
                    {source.why}
                  </p>
                  <p>
                    <span className="label">If wrong </span>
                    {source.consequence}
                  </p>
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {section === 'assumptions' && (
        <>
          <p className="mt-4 text-xs leading-5 text-ink-muted">
            Every constant that materially moves an answer, with what it is worth if it is wrong. A
            number without an error bar is an assertion.
          </p>

          <div className="-mx-1 mt-3 overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-sm">
              <thead>
                <tr className="rule border-b text-left">
                  <th className="label py-2 pr-3">Assumption</th>
                  <th className="label py-2 pr-3">Value</th>
                  <th className="label py-2 pr-3">Basis</th>
                  <th className="label py-2">If it is wrong</th>
                </tr>
              </thead>
              <tbody>
                {ASSUMPTIONS.map((item) => (
                  <tr key={item.name} className="rule border-b align-top">
                    <td className="py-2.5 pr-3">
                      <span className="text-[13px] font-semibold text-ink">{item.name}</span>
                      <span className="num block text-[10px] text-ink-faint">{item.where}</span>
                    </td>
                    <td className="num py-2.5 pr-3 font-medium text-ink">{item.value}</td>
                    <td className="py-2.5 pr-3 text-[11px] leading-5 text-ink-muted">
                      {item.basis}
                    </td>
                    <td className="py-2.5 text-[11px] leading-5 text-ink-muted">
                      {item.sensitivity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {section === 'alternatives' && (
        <>
          <p className="mt-4 text-xs leading-5 text-ink-muted">
            What already exists, and the gap that remains. Each of these does parts of this job, and
            most do their own part better. The claim here is narrow on purpose.
          </p>

          <div className="rule mt-3 grid gap-px border bg-rule md:grid-cols-2">
            {ALTERNATIVES.map((alt) => {
              const isThis = alt.name === 'This prototype'
              return (
                <div key={alt.name} className={`px-4 py-3 ${isThis ? 'bg-sunken' : 'bg-surface'}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-[13px] font-semibold text-ink">{alt.name}</span>
                    <span className="label">{alt.cost}</span>
                  </div>
                  <p className="label mt-0.5">{alt.kind}</p>
                  <p className="mt-2 text-[11px] leading-5 text-ink-muted">{alt.does}</p>
                  <p className="mt-1.5 text-[11px] leading-5 text-ink">
                    <span className="label">{isThis ? 'Limitation ' : 'Gap '}</span>
                    {alt.gap}
                  </p>
                </div>
              )
            })}
          </div>
        </>
      )}

      {section === 'references' && (
        <ol className="mt-4 space-y-px bg-rule">
          {REFERENCES.map((ref) => (
            <li key={ref.title} className="bg-surface px-4 py-3">
              <p className="text-[13px] leading-5 text-ink">
                <span className="font-semibold">{ref.cite}</span>. {ref.title}.
              </p>
              <p className="num mt-0.5 text-[11px] text-ink-faint">{ref.where}</p>
              <p className="mt-1.5 text-[11px] leading-5 text-ink-muted">
                <span className="label">Used for </span>
                {ref.used_for}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}
