# Harborline Charter Intelligence

React + Vite dashboard for bulk-cargo freight decisions on India's East Coast. The UI submits a shipment payload and displays a charter recommendation, forecast range, savings, confidence, risk, and vessel suggestion.

## Run locally

```bash
npm install
npm run dev
```

Create a local `.env` from `.env.example`. Mock mode is enabled by default:

```env
VITE_USE_MOCK=true
VITE_API_BASE_URL=http://localhost:8000
```

To use Member 2's FastAPI service, set `VITE_USE_MOCK=false` and point `VITE_API_BASE_URL` at the API origin. The app sends `POST {VITE_API_BASE_URL}/forecast` with JSON and expects the response shape below. Restart Vite after changing environment variables.

## Request contract

```json
{
  "origin": "Australia",
  "destination": "Paradip",
  "cargo_type": "Coal",
  "cargo_quantity": 50000,
  "vessel_class": "Panamax",
  "contract_duration_days": 30,
  "cargo_value_per_ton": 10000,
  "annual_carrying_rate": 0.08,
  "storage_cost_per_day": 100000,
  "operational_delay_cost_per_day": 50000
}
```

## Response contract

```json
{
  "forecast": { "best": 27000, "expected": 29000, "worst": 35000 },
  "decision": {
    "decision": "WAIT",
    "current_rate": 32000,
    "best_case_saving": 5000,
    "expected_saving": 3000,
    "worst_case_loss": 3000,
    "waiting_cost": 500,
    "net_expected_saving": 2500,
    "reason": "Expected freight rate is lower than the current rate after accounting for waiting cost."
  },
  "confidence": 0.82,
  "risk": "MEDIUM",
  "monte_carlo": { "expected_future_rate": 29200, "simulated_q10": 27100, "simulated_q50": 29050, "simulated_q90": 34800 },
  "forecast_series": [{ "day": 1, "expected": 32000, "lower": 31000, "upper": 33000 }],
  "recommended_vessel": { "vessel": "MV Ocean Star", "type": "Panamax", "distance_nm": 320, "available": true }
}
```