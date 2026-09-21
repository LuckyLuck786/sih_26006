"""
Train the quantile forecasting models.

Two things changed against the first version.

The split is by *date*, not by row index. Rows are now sorted by series
and then by date, so slicing at 80% of the row count would have put whole
lanes entirely in the test set and trained on none of their history. A
date cut keeps every lane in both halves and preserves the property that
matters: the model never sees the future.

The model is also scored against a naive baseline ("tomorrow's rate is
today's rate"). A freight forecaster that cannot beat that baseline is
not adding anything, and reporting the comparison is the honest way to
present accuracy.
"""

import json
import os

import joblib
import numpy as np
from sklearn.metrics import mean_absolute_error

from ml.forecasting.quantile_forecast import QuantileForecastModel
from ml.preprocessing.preprocess import preprocess_data

MODEL_DIR = "ml/models"

TEST_FRACTION = 0.2


def pinball_loss(y_true, y_pred, quantile):
    """
    The loss a quantile regressor is actually optimising.

    Reporting it per quantile shows the Q10 and Q90 models are calibrated,
    not just the median.
    """

    delta = np.asarray(y_true) - np.asarray(y_pred)

    return float(np.mean(np.maximum(quantile * delta, (quantile - 1) * delta)))


def train_models():

    print("=" * 52)
    print("FREIGHT FORECASTING MODEL TRAINING")
    print("=" * 52)

    X, y, processed = preprocess_data()

    # ----------------------------------------------------------
    # Date-based split
    # ----------------------------------------------------------

    dates = processed["date"]

    cutoff = dates.quantile(1.0 - TEST_FRACTION)

    train_mask = dates <= cutoff
    test_mask = dates > cutoff

    X_train, X_test = X[train_mask], X[test_mask]
    y_train, y_test = y[train_mask], y[test_mask]

    print("\nTrain/test split (by date)")
    print(f"  cutoff date : {cutoff.date()}")
    print(f"  training    : {len(X_train):,} rows")
    print(f"  testing     : {len(X_test):,} rows")

    # ----------------------------------------------------------
    # Train
    # ----------------------------------------------------------

    model = QuantileForecastModel()
    model.train(X_train, y_train)

    predictions = model.predict(X_test)

    q10 = predictions["best"]
    q50 = predictions["expected"]
    q90 = predictions["worst"]

    # ----------------------------------------------------------
    # Naive baseline: tomorrow equals today
    # ----------------------------------------------------------

    naive = X_test["freight_rate"].to_numpy()

    model_mae = mean_absolute_error(y_test, q50)
    naive_mae = mean_absolute_error(y_test, naive)

    improvement = (naive_mae - model_mae) / naive_mae * 100 if naive_mae else 0.0

    # Coverage: the share of actuals that fall inside the Q10-Q90 band.
    # A well-calibrated 10-90 interval should capture about 80%.
    inside = np.mean((y_test >= q10) & (y_test <= q90))

    metrics = {
        "rows_train": len(X_train),
        "rows_test": len(X_test),
        "cutoff_date": str(cutoff.date()),
        "features": int(X.shape[1]),
        "series_count": int(
            processed[[c for c in processed.columns if c.startswith("vessel_type_")]].shape[1]
        ),
        "model_mae": round(float(model_mae), 4),
        "naive_mae": round(float(naive_mae), 4),
        "improvement_vs_naive_pct": round(float(improvement), 2),
        "interval_coverage_q10_q90": round(float(inside), 4),
        "pinball_q10": round(pinball_loss(y_test, q10, 0.10), 4),
        "pinball_q50": round(pinball_loss(y_test, q50, 0.50), 4),
        "pinball_q90": round(pinball_loss(y_test, q90, 0.90), 4),
    }

    print("\n" + "=" * 52)
    print("MODEL PERFORMANCE")
    print("=" * 52)
    print(f"\n  Model MAE           : ${metrics['model_mae']}/t")
    print(f"  Naive MAE           : ${metrics['naive_mae']}/t")
    print(f"  Improvement         : {metrics['improvement_vs_naive_pct']}%")
    print(f"  Q10-Q90 coverage    : {metrics['interval_coverage_q10_q90']:.1%}  (target ~80%)")
    print(
        f"  Pinball q10/q50/q90 : {metrics['pinball_q10']} / "
        f"{metrics['pinball_q50']} / {metrics['pinball_q90']}"
    )

    # ----------------------------------------------------------
    # Persist
    # ----------------------------------------------------------

    os.makedirs(MODEL_DIR, exist_ok=True)

    joblib.dump(model.models["q10"], f"{MODEL_DIR}/freight_q10.pkl")
    joblib.dump(model.models["q50"], f"{MODEL_DIR}/freight_q50.pkl")
    joblib.dump(model.models["q90"], f"{MODEL_DIR}/freight_q90.pkl")
    joblib.dump(list(X.columns), f"{MODEL_DIR}/feature_names.pkl")

    with open(f"{MODEL_DIR}/metrics.json", "w") as handle:
        json.dump(metrics, handle, indent=2)
        handle.write("\n")

    # Feature importance makes the forecast defensible rather than a
    # black box, which the problem statement explicitly asks for.
    importance = sorted(
        zip(X.columns, model.models["q50"].feature_importances_, strict=True),
        key=lambda pair: pair[1],
        reverse=True,
    )[:15]

    with open(f"{MODEL_DIR}/feature_importance.json", "w") as handle:
        json.dump(
            [{"feature": f, "importance": int(v)} for f, v in importance],
            handle,
            indent=2,
        )
        handle.write("\n")

    print(f"\nSaved models and metrics to {MODEL_DIR}/")
    print("\nTop drivers of the forecast:")
    for feature, value in importance[:8]:
        print(f"  {feature:34} {value}")

    return metrics


if __name__ == "__main__":
    train_models()
