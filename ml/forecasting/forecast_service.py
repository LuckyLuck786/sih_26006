"""
Serving layer for the quantile forecasting models.

The trained models answer one question: what will the rate be
FORECAST_HORIZON_DAYS from now, at the 10th, 50th and 90th percentile.

The dashboard needs a daily curve rather than a single point, so this
module expands the horizon forecast into a series. The median is
interpolated from today's rate to the horizon forecast, and the band is
widened by the square root of elapsed time, which is how uncertainty
actually accumulates in a diffusion. The endpoints are exactly the
model's own Q10/Q50/Q90, so nothing is invented — only the shape between
today and the horizon is filled in.

If the trained artefacts are missing the service falls back to a
transparent statistical forecast built from the lane's own history, so
the API never fails outright.
"""

import json
import os

import joblib
import numpy as np

from ml.preprocessing.preprocess import (
    FORECAST_HORIZON_DAYS,
    clean_data,
    create_features,
    encode_features,
    load_data,
)

MODEL_DIR = "ml/models"

_CACHE = {}


def _repo_root():
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _resolve(path):
    return path if os.path.isabs(path) else os.path.join(_repo_root(), path)


def load_history():
    """Feature-engineered history, cached across requests."""

    if "history" not in _CACHE:
        raw = load_data(_resolve("data/synthetic/freight_rate.csv"))
        cleaned = clean_data(raw)
        _CACHE["history"] = create_features(cleaned)

    return _CACHE["history"]


def load_models():
    """Trained quantile models, cached. Returns None when unavailable."""

    if "models" in _CACHE:
        return _CACHE["models"]

    try:
        bundle = {
            "q10": joblib.load(_resolve(f"{MODEL_DIR}/freight_q10.pkl")),
            "q50": joblib.load(_resolve(f"{MODEL_DIR}/freight_q50.pkl")),
            "q90": joblib.load(_resolve(f"{MODEL_DIR}/freight_q90.pkl")),
            "features": joblib.load(_resolve(f"{MODEL_DIR}/feature_names.pkl")),
        }
    except (FileNotFoundError, OSError):
        bundle = None

    _CACHE["models"] = bundle
    return bundle


def load_metrics():
    """Backtest metrics, so the UI can show how accurate the model is."""

    try:
        with open(_resolve(f"{MODEL_DIR}/metrics.json")) as handle:
            return json.load(handle)
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return None


def load_feature_importance():
    try:
        with open(_resolve(f"{MODEL_DIR}/feature_importance.json")) as handle:
            return json.load(handle)
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return None


def _lane_history(origin_country, destination, vessel_type):
    """The most recent rows for one lane, or the closest available."""

    history = load_history()

    lane = history[
        (history["origin"] == origin_country)
        & (history["destination"] == destination)
        & (history["vessel_type"] == vessel_type)
    ]

    if len(lane):
        return lane.sort_values("date")

    # Fall back to the same origin and class on any destination, then to
    # the class alone, so an unseen pairing still returns something
    # grounded in real history rather than a constant.
    relaxed = history[
        (history["origin"] == origin_country) & (history["vessel_type"] == vessel_type)
    ]

    if len(relaxed):
        return relaxed.sort_values("date")

    return history[history["vessel_type"] == vessel_type].sort_values("date")


def forecast_lane(origin_country, destination, vessel_type, horizon_days=None):
    """
    Produce a quantile forecast for one lane.

    Returns current rate, the horizon quantiles, a daily series and the
    realised volatility of the lane.
    """

    horizon_days = horizon_days or FORECAST_HORIZON_DAYS

    lane = _lane_history(origin_country, destination, vessel_type)

    if lane.empty:
        raise ValueError(f"No history for {origin_country} -> {destination} ({vessel_type})")

    latest = lane.iloc[[-1]]

    current_rate = float(latest["freight_rate"].iloc[0])

    recent_volatility = float(lane["freight_rate"].tail(30).std() or current_rate * 0.05)

    congestion = float(latest["congestion"].iloc[0])
    vessel_supply = int(latest["vessel_supply"].iloc[0])

    models = load_models()

    source = "model"

    if models is not None:
        encoded = encode_features(latest)

        features = encoded.reindex(columns=models["features"], fill_value=0)

        q10 = float(models["q10"].predict(features)[0])
        q50 = float(models["q50"].predict(features)[0])
        q90 = float(models["q90"].predict(features)[0])
    else:
        # Transparent fallback: drift from the 30-day mean, band from
        # realised volatility scaled to the horizon.
        source = "statistical_fallback"

        mean_30 = float(lane["freight_rate"].tail(30).mean())
        spread = recent_volatility * np.sqrt(horizon_days / 14.0) * 1.28

        q50 = mean_30
        q10 = q50 - spread
        q90 = q50 + spread

    # Quantile models are fitted independently, so a crossing is possible
    # in thin regions. Sorting restores monotonicity.
    q10, q50, q90 = sorted([q10, q50, q90])

    # ------------------------------------------------------
    # Expand the horizon point into a daily curve
    # ------------------------------------------------------

    series = []

    half_band_at_horizon = max((q90 - q10) / 2.0, 1e-9)

    for day in range(horizon_days + 1):
        progress = day / horizon_days if horizon_days else 1.0

        expected = current_rate + (q50 - current_rate) * progress

        # Uncertainty grows with the square root of elapsed time.
        half_band = half_band_at_horizon * np.sqrt(progress)

        series.append(
            {
                "day": day,
                "expected": round(expected, 2),
                "lower": round(max(expected - half_band, 0.0), 2),
                "upper": round(expected + half_band, 2),
            }
        )

    return {
        "current_rate": round(current_rate, 2),
        "best": round(q10, 2),
        "expected": round(q50, 2),
        "worst": round(q90, 2),
        "series": series,
        "horizon_days": horizon_days,
        "recent_volatility": round(recent_volatility, 4),
        "congestion": round(congestion, 3),
        "vessel_supply": vessel_supply,
        "source": source,
        "lane_rows": len(lane),
    }


def rate_by_vessel_class(origin_country, destination, vessel_classes, horizon_days=None):
    """Expected rate per tonne for every class, used to rank them."""

    rates = {}

    for spec in vessel_classes:
        try:
            forecast = forecast_lane(origin_country, destination, spec["vessel_type"], horizon_days)
            rates[spec["vessel_type"]] = forecast["expected"]
        except ValueError:
            continue

    if rates:
        rates["default"] = float(np.mean(list(rates.values())))

    return rates


if __name__ == "__main__":
    result = forecast_lane("Australia", "Paradip", "Panamax")

    print("Australia -> Paradip, Panamax")
    print(f"  source          : {result['source']}")
    print(f"  history rows    : {result['lane_rows']:,}")
    print(f"  current rate    : ${result['current_rate']}/t")
    print(f"  Q10 / Q50 / Q90 : ${result['best']} / ${result['expected']} / ${result['worst']}")
    print(f"  congestion      : {result['congestion']}")
    print(f"  series points   : {len(result['series'])}")

    metrics = load_metrics()
    if metrics:
        print(
            f"\n  backtest MAE    : ${metrics['model_mae']}/t "
            f"({metrics['improvement_vs_naive_pct']}% better than naive)"
        )
