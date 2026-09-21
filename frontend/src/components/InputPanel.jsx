import { useState } from 'react'

import { FIELD_LABELS as LABELS, selectOptions } from '../lib/shipmentDefaults'

export default function InputPanel({ values, onChange, onSubmit, loading }) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [errors, setErrors] = useState({})

  const update = (name, value) => onChange({ ...values, [name]: value })

  const validate = () => {
    const nextErrors = {}

    // vessel_class is deliberately not required: leaving it blank asks the
    // optimiser to choose, which is what the problem statement actually
    // wants the system to do.
    ;['origin', 'destination', 'cargo_type', 'cargo_quantity', 'contract_duration'].forEach(
      (field) => {
        if (!String(values[field] || '').trim()) nextErrors[field] = 'This field is required.'
      },
    )

    ;['cargo_quantity', 'contract_duration', 'cargo_value_per_ton', 'annual_carrying_rate'].forEach(
      (field) => {
        if (values[field] !== '' && Number(values[field]) <= 0)
          nextErrors[field] = 'Must be greater than 0.'
      },
    )

    if (values.cargo_quantity !== '' && Number(values.cargo_quantity) < 1000) {
      nextErrors.cargo_quantity = 'Minimum parcel is 1,000 tonnes.'
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const submit = (event) => {
    event.preventDefault()
    if (validate()) onSubmit(values)
  }

  const fieldClass = (name) =>
    `mt-2 w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 ${
      errors[name] ? 'border-red-400' : 'border-slate-200'
    }`

  const label = (name, text) => (
    <label htmlFor={name} className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
      {text}
    </label>
  )

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6"
    >
      <div className="mb-5">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-teal-700">
          Shipment brief
        </p>
        <h2 className="font-display mt-1 text-2xl font-bold text-slate-900">Set your voyage</h2>
        <p className="mt-1 text-sm leading-5 text-slate-500">
          Give the desk a few details to price the next move.
        </p>
      </div>

      <div className="space-y-4">
        {['origin', 'destination', 'cargo_type', 'vessel_class'].map((name) => (
          <div key={name}>
            {label(name, LABELS[name])}
            <select
              id={name}
              value={values[name]}
              onChange={(event) => update(name, event.target.value)}
              className={fieldClass(name)}
            >
              <option value="">
                {name === 'vessel_class'
                  ? 'Auto — let the optimiser choose'
                  : `Select ${LABELS[name].toLowerCase()}`}
              </option>
              {selectOptions[name].map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            {name === 'vessel_class' && !errors[name] && (
              <p className="mt-1 text-xs text-slate-400">
                Leave on auto to rank all four classes against port limits.
              </p>
            )}
            {errors[name] && <p className="mt-1 text-xs text-red-600">{errors[name]}</p>}
          </div>
        ))}

        <div className="grid grid-cols-2 gap-3">
          <div>
            {label('cargo_quantity', 'Cargo quantity')}
            <input
              id="cargo_quantity"
              type="number"
              min="1000"
              step="1000"
              value={values.cargo_quantity}
              onChange={(event) => update('cargo_quantity', event.target.value)}
              className={fieldClass('cargo_quantity')}
            />
            <p className="mt-1 text-xs text-slate-400">Tonnes</p>
            {errors.cargo_quantity && (
              <p className="mt-1 text-xs text-red-600">{errors.cargo_quantity}</p>
            )}
          </div>
          <div>
            {label('contract_duration', 'Contract duration')}
            <input
              id="contract_duration"
              type="number"
              min="1"
              value={values.contract_duration}
              onChange={(event) => update('contract_duration', event.target.value)}
              className={fieldClass('contract_duration')}
            />
            <p className="mt-1 text-xs text-slate-400">Days — drives spot vs term</p>
            {errors.contract_duration && (
              <p className="mt-1 text-xs text-red-600">{errors.contract_duration}</p>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setAdvancedOpen(!advancedOpen)}
        className="mt-6 flex w-full items-center justify-between border-t border-slate-100 pt-4 text-left text-sm font-bold text-slate-700"
      >
        Advanced <span className="text-lg text-teal-600">{advancedOpen ? '−' : '+'}</span>
      </button>

      {advancedOpen && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[
            ['cargo_value_per_ton', 'Cargo value / tonne', '1'],
            ['annual_carrying_rate', 'Annual carrying rate', '0.01'],
          ].map(([name, text, step]) => (
            <div key={name}>
              {label(name, text)}
              <input
                id={name}
                type="number"
                step={step}
                min="0.001"
                value={values[name]}
                onChange={(event) => update(name, event.target.value)}
                className={fieldClass(name)}
              />
              {errors[name] && <p className="mt-1 text-xs text-red-600">{errors[name]}</p>}
            </div>
          ))}
          <p className="col-span-2 text-xs leading-5 text-slate-400">
            These set the cost of waiting: cargo value multiplied by the carrying rate gives the
            daily capital cost of holding the position open.
          </p>
        </div>
      )}

      <button
        disabled={loading}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-teal-600/20 transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        )}
        {loading ? 'Analyzing voyage...' : 'Analyze shipment'}
      </button>
    </form>
  )
}
