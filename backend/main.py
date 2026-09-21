"""
FastAPI service for the Harborline charter-intelligence dashboard.

handoff.md documented a `POST /forecast` contract and a frontend that
could switch to it with VITE_USE_MOCK=false, but no server was ever
written. This is that server.

Run it from the repository root:

    uvicorn backend.main:app --reload --port 8000

Then point the frontend at it:

    VITE_USE_MOCK=false
    VITE_API_BASE_URL=http://localhost:8000

Live AIS enrichment is optional. Set DATADOCKED_API_KEY in the
environment to enable it; without the key the service still answers
every request using the simulated fleet, and says which it used.
"""

import os
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ml import pipeline

DATADOCKED_BASE = "https://datadocked.com/api/vessels_operations"

# Read from the environment only. The key is never written into the
# repository, and never exposed to the browser: the frontend calls this
# service, and this service calls Data Docked.
DATADOCKED_API_KEY = os.environ.get("DATADOCKED_API_KEY", "").strip()


app = FastAPI(
    title="Harborline Charter Intelligence API",
    description=(
        "Freight forecasting and charter decision support for bulk cargo "
        "procurement to the East Coast of India (SIH PS 26006)."
    ),
    version="2.0.0",
)

# The dashboard is served from a different origin in development and
# from Vercel in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class ShipmentRequest(BaseModel):
    origin: str = Field(..., description="Origin country or load port")
    destination: str = Field(..., description="East Coast India discharge port")
    cargo_quantity: float = Field(50000, gt=0, description="Tonnes")
    cargo_type: Optional[str] = Field(None, description="Coal, Iron Ore, ...")
    vessel_class: Optional[str] = Field(
        None, description="Optional preferred class; the optimiser picks if omitted"
    )
    contract_duration: int = Field(30, gt=0, description="Days")
    cargo_value_per_ton: float = Field(9500.0, gt=0)
    annual_carrying_rate: float = Field(0.08, ge=0)
    storage_cost_per_day: float = Field(0.0, ge=0)
    operational_delay_cost_per_day: float = Field(0.0, ge=0)


@app.get("/health")
def health():
    """Liveness probe plus a note on which data sources are wired."""

    metrics = pipeline.forecast_service.load_metrics()

    return {
        "status": "ok",
        "model_trained": metrics is not None,
        "model_mae": metrics.get("model_mae") if metrics else None,
        "live_ais_enabled": bool(DATADOCKED_API_KEY),
    }


@app.get("/reference")
def reference():
    """Ports, vessel classes and lanes, for populating the UI."""

    data = pipeline.reference_data()

    return {
        "ports": data["ports"],
        "vessel_classes": data["vessel_classes"],
        "origins": sorted(
            {p["country"] for p in data["ports"] if p["role"] == "load"}
        ),
        "destinations": [
            p["port"] for p in data["ports"] if p["role"] == "discharge"
        ],
        "vessels": data["vessels"],
    }


@app.post("/forecast")
def forecast(request: ShipmentRequest):
    """
    The main endpoint. Returns the full decision response documented in
    frontend/README.md.
    """

    try:
        return pipeline.run_decision_pipeline(
            origin=request.origin,
            destination=request.destination,
            cargo_quantity=request.cargo_quantity,
            cargo_value_per_ton=request.cargo_value_per_ton,
            annual_carrying_rate=request.annual_carrying_rate,
            storage_cost_per_day=request.storage_cost_per_day,
            operational_delay_cost_per_day=request.operational_delay_cost_per_day,
            contract_duration_days=request.contract_duration,
            vessel_type=request.vessel_class,
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))


@app.get("/ais/vessels-by-area")
async def vessels_by_area(latitude: float, longitude: float,
                          circle_radius: int = 50):
    """
    Live AIS positions near a point, proxied from Data Docked.

    Falls back to the simulated fleet when no key is configured or the
    upstream call fails, so the dashboard never breaks during a demo.
    The response always states which source was used.
    """

    if not DATADOCKED_API_KEY:
        return {"source": "simulated", "reason": "no_api_key",
                "vessels": _simulated_fleet()}

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.get(
                f"{DATADOCKED_BASE}/get-vessels-by-area",
                params={
                    "latitude": latitude,
                    "longitude": longitude,
                    "circle_radius": circle_radius,
                },
                headers={
                    "accept": "application/json",
                    "x-api-key": DATADOCKED_API_KEY,
                },
            )

        if response.status_code != 200:
            return {"source": "simulated",
                    "reason": f"upstream_{response.status_code}",
                    "vessels": _simulated_fleet()}

        return {"source": "live", "vessels": response.json()}

    except (httpx.HTTPError, ValueError) as error:
        return {"source": "simulated", "reason": type(error).__name__,
                "vessels": _simulated_fleet()}


@app.get("/ais/credits")
async def credits():
    """Remaining Data Docked credits, so usage stays visible."""

    if not DATADOCKED_API_KEY:
        raise HTTPException(status_code=503, detail="No API key configured")

    async with httpx.AsyncClient(timeout=12.0) as client:
        response = await client.get(
            f"{DATADOCKED_BASE}/my-credits",
            headers={"accept": "application/json",
                     "x-api-key": DATADOCKED_API_KEY},
        )

    return response.json()


def _simulated_fleet():
    """The tracked fleet from vessels.json, shaped like an AIS response."""

    data = pipeline.reference_data()

    return [
        {
            "vessel_name": v["vessel_name"],
            "vessel_type": v["vessel_type"],
            "latitude": v["latitude"],
            "longitude": v["longitude"],
            "status": v["status"],
            "capacity": v["capacity"],
        }
        for v in data["vessels"]
    ]
