"""
Export model output and reference data for the static dashboard.

The deployed dashboard has no Python runtime. Rather than shipping mock
numbers, this script runs the trained quantile models across every
lane/class combination and writes their real output to JSON, which the
browser then feeds into the same decision math implemented in
`frontend/src/engine/`.

So the forecast the dashboard shows is the model's own forecast, and
every calculation downstream of it — vessel ranking, optimal stopping,
idle time, spot-versus-term, risk — runs live in the browser against
whatever cargo size, port pair and contract duration the user enters.

    python -m ml.export_frontend_data
"""

import json
import os

from ml import pipeline
from ml.forecasting import forecast_service


OUT_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "src", "data"
)


def main():

    os.makedirs(OUT_DIR, exist_ok=True)

    data = pipeline.reference_data()

    ports = data["ports"]
    classes = data["vessel_classes"]
    routes = data["routes"]

    origins = sorted({p["country"] for p in ports if p["role"] == "load"})
    destinations = [p["port"] for p in ports if p["role"] == "discharge"]

    # ----------------------------------------------------------
    # Run the model across every lane and class
    # ----------------------------------------------------------

    forecasts = {}
    generated = 0

    for origin in origins:
        for destination in destinations:
            for spec in classes:

                vessel_type = spec["vessel_type"]
                key = f"{origin}|{destination}|{vessel_type}"

                try:
                    result = forecast_service.forecast_lane(
                        origin, destination, vessel_type
                    )
                except ValueError:
                    continue

                forecasts[key] = {
                    "current_rate": result["current_rate"],
                    "best": result["best"],
                    "expected": result["expected"],
                    "worst": result["worst"],
                    "horizon_days": result["horizon_days"],
                    "congestion": result["congestion"],
                    "vessel_supply": result["vessel_supply"],
                    "volatility": result["recent_volatility"],
                    "source": result["source"],
                }

                generated += 1

    write("forecasts.json", forecasts)
    write("ports.json", ports)
    write("vessel_classes.json", classes)
    write("routes.json", routes)
    write("vessels.json", data["vessels"])

    write("model_metrics.json", {
        "metrics": forecast_service.load_metrics(),
        "feature_importance": forecast_service.load_feature_importance(),
    })

    print(f"forecasts.json        {generated:>5} lane/class forecasts")
    print(f"ports.json            {len(ports):>5} ports")
    print(f"routes.json           {len(routes):>5} lanes")
    print(f"vessels.json          {len(data['vessels']):>5} vessels")
    print(f"\nWritten to {os.path.relpath(OUT_DIR)}")


def write(name, payload):
    path = os.path.join(OUT_DIR, name)
    with open(path, "w") as handle:
        json.dump(payload, handle, separators=(",", ":"))
        handle.write("\n")


if __name__ == "__main__":
    main()
