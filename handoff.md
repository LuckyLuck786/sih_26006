# Frontend Handoff

## Project

This repository contains a React + Vite frontend for the Harborline Charter Intelligence freight decision dashboard. The frontend collects shipment assumptions and displays a charter decision, forecast values, savings, confidence, risk, forecast ranges, and a recommended vessel.

The frontend lives in `frontend/`.

## Work completed

The analysis screen was showing an unavailable-analysis error when the backend was not running. The frontend already had a mock response, but it was only used when `VITE_USE_MOCK` was explicitly set to `true`. Because no local `.env` file was present, the app fell through to the API request and tried to call `http://localhost:8000/forecast`.

The frontend now uses local dummy data by default. The API remains available as an explicit opt-in for future backend integration.

### Files changed

#### `frontend/src/data/shipmentAnalysis.json`

This is the new local data source for analysis results. It contains a complete response object with:

- Forecast summary: best, expected, and worst freight rates.
- Decision details: `WAIT`, current rate, savings, waiting cost, net expected saving, and explanation.
- Confidence and risk values.
- Monte Carlo summary values.
- A 14-day forecast series with expected, lower, and upper values.
- Recommended vessel information.

The JSON shape matches the response contract documented in `frontend/README.md` and consumed by the existing result components.

#### `frontend/src/services/api.js`

The service now imports the data from `../data/shipmentAnalysis.json`.

The mode check changed from:

```js
import.meta.env.VITE_USE_MOCK === 'true'
```

to:

```js
import.meta.env.VITE_USE_MOCK !== 'false'
```

This means:

- No `.env` file: local dummy data is used.
- `VITE_USE_MOCK=true`: local dummy data is used.
- `VITE_USE_MOCK=false`: the frontend calls the backend API.

In local mode, the existing behavior is preserved:

- An 800 ms delay keeps the loading state visible.
- The current rate and expected rate are scaled slightly based on `cargo_quantity`.
- Expected savings and net expected savings are recalculated.
- Every forecast-series value is scaled consistently.

In backend mode, the service still sends `POST {VITE_API_BASE_URL}/forecast` with the submitted shipment payload and preserves the existing error messages.

#### `frontend/src/mock/mockResponse.json`

The old duplicate mock file was removed because its contents now live in the dedicated `frontend/src/data/` folder.

## Runtime flow

1. The user completes the shipment form in `frontend/src/components/InputPanel.jsx`.
2. `frontend/src/App.jsx` converts numeric form values to numbers and calls `analyzeShipment(payload)`.
3. `frontend/src/services/api.js` uses local JSON data unless `VITE_USE_MOCK=false`.
4. The result is stored in `App` state.
5. The existing components render the decision banner, result cards, forecast chart, and vessel recommendation.
6. If the local data path is used, no backend or network request is required.

## Local development

From the repository root:

```powershell
Set-Location frontend
npm install
npm run dev
```

Open the local Vite URL printed by the terminal. Submit a valid shipment form and confirm that the analysis result appears after the loading state.

The production build can be checked with:

```powershell
Set-Location frontend
npm run build
```

The build was run after the change and completed successfully. Vite emitted only its existing large-chunk warning; it did not report a compilation error.

## Backend integration later

To use the FastAPI service instead of the local data, create `frontend/.env` from `frontend/.env.example` and set:

```env
VITE_USE_MOCK=false
VITE_API_BASE_URL=http://localhost:8000
```

Restart Vite after changing environment variables. The backend must expose:

```text
POST /forecast
Content-Type: application/json
```

The response must include the same fields as `frontend/src/data/shipmentAnalysis.json`, especially `decision`, `forecast`, `forecast_series`, `confidence`, `risk`, `monte_carlo`, and `recommended_vessel`.

## Current git state and intended commit

The frontend change consists of:

- New file: `frontend/src/data/shipmentAnalysis.json`
- Modified file: `frontend/src/services/api.js`
- Deleted file: `frontend/src/mock/mockResponse.json`
- New file: `handoff.md`

No commit was created as part of this handoff. Review the diff before committing, especially if other contributors have changed the working tree.

## Push to the fork

The exact remote and branch names depend on the local clone, so inspect them first:

```powershell
git remote -v
git branch --show-current
git status --short
```

After reviewing the diff:

```powershell
git diff -- frontend/src/services/api.js frontend/src/data/shipmentAnalysis.json handoff.md
git diff --stat
git diff --check
```

Stage and commit the frontend handoff:

```powershell
git add frontend/src/services/api.js frontend/src/data/shipmentAnalysis.json frontend/src/mock/mockResponse.json handoff.md
git commit -m "Use local frontend data for shipment analysis"
```

Push the current branch to the fork remote. Replace `<fork-remote>` and `<branch>` with the values from the repository configuration:

```powershell
git push <fork-remote> <branch>
```

If the current branch has no upstream yet, use:

```powershell
git push -u <fork-remote> <branch>
```

Do not force-push unless the repository owner explicitly requests it. If the fork remote is named `origin`, the usual command is:

```powershell
git push origin <branch>
```

## Follow-up considerations

- Replace the sample JSON with a generated or refreshed fixture when realistic test data is available.
- Add a frontend test for `analyzeShipment` covering default local mode, quantity scaling, and explicit backend mode.
- Consider code-splitting the Recharts bundle if the Vite chunk-size warning becomes a deployment concern.
- Keep the local JSON response compatible with the backend response contract so switching modes does not require component changes.