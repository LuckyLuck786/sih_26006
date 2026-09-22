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
    `mt-1.5 w-full border bg-surface px-2.5 py-2 text-[13px] text-ink outline-none transition-colors focus:border-navy ${
      errors[name] ? 'border-negative' : 'border-rule-strong'
    }`

  const label = (name, text) => (
    <label htmlFor={name} className="label">
      {text}
    </label>
  )

  return (
    <form onSubmit={submit} className="rule border bg-surface">
      <header className="rule border-b bg-sunken px-4 py-3">
        <p className="label">Shipment brief</p>
        <h2 className="mt-1 text-[15px] font-semibold leading-tight text-ink">Set your voyage</h2>
      </header>

      <div className="px-4 py-4">
        <div className="space-y-3.5">
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
                    ? 'Auto: let the optimiser choose'
                    : `Select ${LABELS[name].toLowerCase()}`}
                </option>
                {selectOptions[name].map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
              {name === 'vessel_class' && !errors[name] && (
                <p className="mt-1 text-xs text-ink-faint">
                  Leave on auto to rank all four classes against port limits.
                </p>
              )}
              {errors[name] && <p className="mt-1 text-xs text-negative">{errors[name]}</p>}
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
              <p className="mt-1 text-xs text-ink-faint">Tonnes</p>
              {errors.cargo_quantity && (
                <p className="mt-1 text-xs text-negative">{errors.cargo_quantity}</p>
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
              <p className="mt-1 text-xs text-ink-faint">Days, drives spot vs term</p>
              {errors.contract_duration && (
                <p className="mt-1 text-xs text-negative">{errors.contract_duration}</p>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="mt-6 flex w-full items-center justify-between border-t border-rule pt-4 text-left text-sm font-bold text-ink"
        >
          Advanced <span className="text-lg text-navy">{advancedOpen ? '−' : '+'}</span>
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
                {errors[name] && <p className="mt-1 text-xs text-negative">{errors[name]}</p>}
              </div>
            ))}
            <p className="col-span-2 text-xs leading-5 text-ink-faint">
              These set the cost of waiting: cargo value multiplied by the carrying rate gives the
              daily capital cost of holding the position open.
            </p>
          </div>
        )}

        <button
          disabled={loading}
          className="mt-5 w-full bg-navy px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:bg-navy-soft disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Analyzing' : 'Analyze shipment'}
        </button>
      </div>
    </form>
  )
}
