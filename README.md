# Harborline — Charter Intelligence

**Smart India Hackathon · PS 26006 · Ministry of Steel / SAIL**
*Intelligent freight forecasting for vessel chartering and bulk cargo procurement to the East Coast of India*

**Live dashboard:** https://sih-prototype-seven-psi.vercel.app
**Repository:** https://github.com/LuckyLuck786/sih_26006

---

## What it does

Bulk cargo procurement to India's East Coast is currently reactive: the desk checks the
freight market daily and fixes when it has to. This system replaces that with a
forward-looking decision:

- **when** to fix a charter, from an optimal-stopping model rather than a gut call
- **which vessel class** to use, ranked against the physical limits of both ports
- **how much idle time** the voyage will carry, and how to reduce it
- **what could go wrong**, as ranked early warnings
- **spot or term**, compared on a risk-adjusted basis

Every number on the dashboard is computed from the user's own inputs. Nothing is a
static mock.

---

## Mapping to the problem statement

| PS requirement | Where it lives |
|---|---|
| Freight rate forecasting | `ml/forecasting/` — LightGBM quantile regression (Q10/Q50/Q90) |
| **(a)** Optimal market entry timing | `ml/decision/longstaff_schwartz.py` — optimal stopping |
| **(b)** Vessel type optimisation | `ml/decision/vessel_optimizer.py` — ranks all four classes |
| **(c)** Idle scenario management | `ml/decision/idle_management.py` — berth queues, ballast, demurrage |
| **(d)** Risk mitigation | `ml/risk/alerts.py` — volatility, congestion, supply, decision fragility |
| **Objective:** spot → term contracts | `ml/decision/contract_strategy.py` |
| Dashboard | `frontend/` — React + Vite, one tab per requirement |

All five origins named in the problem statement (Australia, United States, Mozambique,
Russia, Indonesia) and all seven East Coast ports (Paradip, Vizag, Gangavaram, Gopalpur,
Dhamra, **Sagar-Sandheads**, Haldia) are modelled.

---

## Forecast accuracy

The model targets the rate **14 days ahead**, which is the horizon a charter entry
decision actually needs. Next-day forecasting is close to unbeatable by simple
persistence on a mean-reverting series and answers the wrong question.

| Metric | Value |
|---|---|
| Model MAE | **$1.17 /tonne** |
| Naive baseline ("tomorrow = today") | $1.30 /tonne |
| Improvement over baseline | **10.1%** |
| Q10–Q90 interval coverage | **78.3%** (target 80%) |
| Training rows / features | 57,120 / 41 |

Split by **date**, not by row, so the model never sees the future. The dashboard shows
these figures and the model's feature importances rather than asking anyone to take the
forecast on trust.

---

## The port-constraint model

A draft restriction does not simply exclude a vessel — real bulk carriers call at shallow
ports **part-laden**. This is what turns a yes/no check into a procurement decision.

Australia → Haldia, 120,000 t:

```
1. Supramax    $65.82/t   payload 24,538 t of 58,000    5 voyages
2. Handysize   $73.05/t   payload 19,385 t of 28,000    7 voyages
x  Panamax     Beam 32.3 m exceeds Haldia limit 32 m
x  Capesize    LOA 292 m exceeds Haldia limit 240 m
```

The same parcel into Gangavaram (21 m draft) is carried by one Capesize at **$34.57/t** —
roughly half the cost per tonne. Port infrastructure, not the freight rate, is the
dominant cost driver, and that is the case the dashboard is built to make.

---

## Running it

### Dashboard only

```bash
cd frontend && npm install && npm run dev
```

The decision engine runs in the browser (`frontend/src/engine/`), using the trained
models' exported forecasts. No backend required.

### Full stack with the Python service

```bash
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000
```

Then point the frontend at it:

```bash
# frontend/.env
VITE_USE_MOCK=false
VITE_API_BASE_URL=http://localhost:8000
```

> **macOS:** LightGBM needs the OpenMP runtime Apple does not ship.
> If `import lightgbm` fails, run `brew install libomp`.

### Command line

```bash
python main.py --origin Australia --destination Haldia --quantity 120000
python main.py --origin Indonesia --destination Vizag --json
```

### Regenerating data and models

```bash
python data/generate_reference_data.py   # ports, routes, fleet, rate history
python -m ml.forecasting.train           # retrain quantile models
python -m ml.export_frontend_data        # export forecasts for the browser
```

---

## Development

```bash
pip install -e ".[dev]"

pytest                    # 117 tests
pytest -m "not slow"      # skip the ones that load the trained models
ruff check . && ruff format --check .

cd frontend
npm run lint
npm run format:check
npm test                  # 61 engine tests
npm run build
```

CI runs all of the above on every push, plus a secret scan that fails the
build if a 32-character API key is ever committed.

Tests pin the behaviour of the bugs that were fixed: cross-lane feature
leakage in the preprocessor, the inverted waiting-cost term and the
unreachable day zero in the optimal-stopping model, and the draft-limited
payload arithmetic that decides vessel class.

---

## Currency

Dry bulk freight is quoted in US dollars per tonne worldwide, so the engine computes in
USD and the market rate is shown in USD. Every figure is also converted to rupees, which
is what an Indian procurement desk budgets and reports in, grouped in lakh and crore.

The USD/INR rate comes from the European Central Bank daily reference rate via
Frankfurter, with open.er-api.com as a fallback and a pinned rate as a last resort. The
rate and its date are shown in the masthead rather than buried, because a converted total
is only meaningful alongside the rate used. Both sources are keyless.

---

## API keys

**None are required.** The dashboard, the models and the full decision engine run with no
external service.

One **optional** integration exists: live AIS vessel positions on the map, via
[Data Docked](https://datadocked.com). Without it the map shows the tracked fleet and says
so on a badge.

To enable it, set a server-side environment variable in the Vercel project:

```
DATADOCKED_API_KEY = <your key>
```

It must **not** be prefixed `VITE_`. Vite compiles `VITE_*` variables into the public
JavaScript bundle, which would publish the key. The browser calls `/api/ais`
(`frontend/api/ais.js`), and that serverless function calls Data Docked server-side,
caching responses for 10 minutes because the account is metered.

Maps use **OpenStreetMap** tiles, which need no key or account.

---

## Security headers

`frontend/vercel.json` sets CSP, `X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy` and `Cross-Origin-Opener-Policy`.

The policy allows Google Fonts and OpenStreetMap tiles, and nothing else off-origin.
`script-src` is `'self'` with no `unsafe-inline`: the production build emits no inline
script. `style-src` does carry `'unsafe-inline'`, because Leaflet and Recharts set inline
style attributes on the elements they render and the map and charts do not work without
it. That is a real weakening of the policy and is recorded here rather than left implicit.

---

## Layout

```
main.py           CLI entry point
backend/          FastAPI service (POST /forecast)
data/             Reference data + reproducible generator
ml/
  forecasting/    Quantile models, training, serving
  decision/       Vessel optimiser, optimal stopping, idle, contracts
  risk/           Early-warning engine
  pipeline.py     Orchestrates every stage
src/              Vessel availability, port compatibility, routing
tests/            pytest suite
frontend/
  api/            Serverless AIS proxy (keeps the key server-side)
  src/engine/     Browser mirror of the Python decision math, one
                  module per Python module (vessels, timing, idle,
                  contracts, risk)
  src/components/ One panel per PS requirement
  src/lib/        Formatting helpers and form defaults
```
