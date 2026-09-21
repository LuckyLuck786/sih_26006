import { money, rate, tonnes, percent, Panel, Pill } from './ui'

/**
 * PS 26006 requirement (b): vessel type optimisation.
 *
 * The original prototype made the user pick a class and then filtered a
 * list. This ranks all four classes by all-in cost per tonne against the
 * physical limits of both ports, and shows why the rejected ones cannot
 * serve the lane — which is the part that demonstrates the constraint
 * modelling.
 */
export default function VesselRanking({ recommendation, route }) {
  if (!recommendation) return null

  const { ranked = [], rejected = [], chosen, saving_vs_next_best_usd: saving, user_choice_infeasible: infeasible } =
    recommendation

  return (
    <Panel
      eyebrow="Requirement (b) · Vessel type optimisation"
      title={chosen ? `${chosen.vessel_type} recommended` : 'No feasible class'}
      subtitle={
        route
          ? `${route.load_port} (${route.load_port_unlocode}) → ${route.discharge_port} (${route.discharge_port_unlocode}) · ${route.distance_nm?.toLocaleString()} nm`
          : undefined
      }
      right={saving ? <Pill tone="bg-emerald-100 text-emerald-800">{money(saving)} vs next best</Pill> : null}
    >
      {infeasible && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          <strong>{infeasible.vessel_type} cannot serve this lane.</strong> {infeasible.reasons?.[0]}. Showing
          the optimiser's choice instead.
        </div>
      )}

      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-[0.08em] text-slate-500">
              <th className="py-2 pr-3 font-bold">#</th>
              <th className="py-2 pr-3 font-bold">Class</th>
              <th className="py-2 pr-3 text-right font-bold">All-in $/t</th>
              <th className="py-2 pr-3 text-right font-bold">Payload</th>
              <th className="py-2 pr-3 text-right font-bold">Used</th>
              <th className="py-2 pr-3 text-right font-bold">Voyages</th>
              <th className="py-2 pr-3 text-right font-bold">Round trip</th>
              <th className="py-2 text-right font-bold">Total cost</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((option) => {
              const isChosen = chosen && option.vessel_type === chosen.vessel_type
              return (
                <tr
                  key={option.vessel_type}
                  className={`border-b border-slate-100 ${isChosen ? 'bg-teal-50/70' : ''}`}
                >
                  <td className="py-2.5 pr-3 font-bold text-slate-400">{option.rank}</td>
                  <td className="py-2.5 pr-3">
                    <span className="font-bold text-slate-900">{option.vessel_type}</span>
                    {isChosen && <span className="ml-2 text-[10px] font-bold text-teal-700">PICKED</span>}
                    <span className="block text-[11px] text-slate-400">
                      {option.dwt.toLocaleString()} dwt
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-right font-bold text-slate-900">
                    {rate(option.cost_per_tonne_usd)}
                  </td>
                  <td className="py-2.5 pr-3 text-right text-slate-700">
                    {tonnes(option.max_payload_tonnes)}
                  </td>
                  <td className="py-2.5 pr-3 text-right text-slate-700">
                    {percent(option.payload_utilisation)}
                  </td>
                  <td className="py-2.5 pr-3 text-right text-slate-700">{option.voyages_required}</td>
                  <td className="py-2.5 pr-3 text-right text-slate-700">{option.round_trip_days} d</td>
                  <td className="py-2.5 text-right text-slate-700">{money(option.total_cost_usd)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {chosen?.notes?.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {chosen.notes.map((note) => (
            <li key={note} className="flex gap-2 text-xs leading-5 text-slate-600">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-teal-500" />
              {note}
            </li>
          ))}
        </ul>
      )}

      {rejected.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
            Excluded by port infrastructure
          </p>
          <ul className="mt-2 space-y-2">
            {rejected.map((option) => (
              <li
                key={option.vessel_type}
                className="flex flex-wrap items-baseline gap-x-2 rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-red-900"
              >
                <strong className="font-bold">{option.vessel_type}</strong>
                <span>{option.reasons?.join('; ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}
