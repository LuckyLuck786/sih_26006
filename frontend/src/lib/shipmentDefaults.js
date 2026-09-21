import { ORIGINS, DESTINATIONS, VESSEL_CLASSES } from '../engine'

/** Defaults for the shipment brief form. */
export const initialValues = {
  origin: 'Australia',
  destination: 'Paradip',
  cargo_type: 'Coal',
  cargo_quantity: '120000',
  vessel_class: '',
  contract_duration: '90',
  cargo_value_per_ton: '9500',
  annual_carrying_rate: '0.08',
}

/**
 * Origins and destinations come from the same reference data the engine
 * uses, so the dropdowns can never drift out of sync with the routes that
 * actually exist. Both cover every location named in PS 26006, including
 * Sagar-Sandheads, which the first prototype omitted.
 */
export const selectOptions = {
  origin: ORIGINS,
  destination: DESTINATIONS,
  cargo_type: ['Coal', 'Iron Ore', 'Limestone', 'Fertilizer', 'Grain'],
  vessel_class: VESSEL_CLASSES.map((c) => c.vessel_type),
}

export const FIELD_LABELS = {
  origin: 'Origin country',
  destination: 'Discharge port',
  cargo_type: 'Cargo type',
  vessel_class: 'Vessel class',
}
