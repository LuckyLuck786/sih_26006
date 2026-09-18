import os
import joblib
import pandas as pd

from sklearn.metrics import mean_absolute_error

from ml.preprocessing.preprocess import preprocess_data
from ml.forecasting.quantile_forecast import QuantileForecastModel


MODEL_DIR = "ml/models"


def train_models():

    print("========================================")
    print("FREIGHT FORECASTING MODEL TRAINING")
    print("========================================")

    # -----------------------------------------
    # 1. Load and preprocess data
    # -----------------------------------------

    print("\n1. Preprocessing data...")

    X, y, processed_df = preprocess_data()

    print(f"X shape: {X.shape}")
    print(f"y shape: {y.shape}")

    # -----------------------------------------
    # 2. Time-based train/test split
    # -----------------------------------------
    #
    # IMPORTANT:
    # We don't randomly shuffle time-series data.
    #
    # Earlier data -> training
    # Later data  -> testing
    #

    split_index = int(len(X) * 0.8)

    X_train = X.iloc[:split_index]
    X_test = X.iloc[split_index:]

    y_train = y.iloc[:split_index]
    y_test = y.iloc[split_index:]

    print("\n2. Train/Test split")
    print(f"Training samples: {len(X_train)}")
    print(f"Testing samples: {len(X_test)}")

    # -----------------------------------------
    # 3. Train quantile models
    # -----------------------------------------

    print("\n3. Training quantile models...")

    model = QuantileForecastModel()

    model.train(X_train, y_train)

    # -----------------------------------------
    # 4. Predictions
    # -----------------------------------------

    print("\n4. Generating predictions...")

    predictions = model.predict(X_test)

    q10_pred = predictions["best"]
    q50_pred = predictions["expected"]
    q90_pred = predictions["worst"]

    # -----------------------------------------
    # 5. Evaluate median prediction
    # -----------------------------------------

    mae = mean_absolute_error(y_test, q50_pred)

    print("\n========================================")
    print("MODEL PERFORMANCE")
    print("========================================")

    print(f"\nMedian Forecast MAE: {mae:.2f}")

    # -----------------------------------------
    # 6. Display predictions
    # -----------------------------------------

    results = pd.DataFrame({
        "actual": y_test.values,
        "best_q10": q10_pred,
        "expected_q50": q50_pred,
        "worst_q90": q90_pred
    })

    print("\nSample predictions:")
    print(results.head(10))

    # -----------------------------------------
    # 7. Save models
    # -----------------------------------------

    os.makedirs(MODEL_DIR, exist_ok=True)

    joblib.dump(
        model.models["q10"],
        f"{MODEL_DIR}/freight_q10.pkl"
    )

    joblib.dump(
        model.models["q50"],
        f"{MODEL_DIR}/freight_q50.pkl"
    )

    joblib.dump(
        model.models["q90"],
        f"{MODEL_DIR}/freight_q90.pkl"
    )

    # Save feature names
    joblib.dump(
        list(X.columns),
        f"{MODEL_DIR}/feature_names.pkl"
    )

    print("\n========================================")
    print("MODELS SAVED")
    print("========================================")

    print(f"\nSaved to: {MODEL_DIR}/")

    print("  freight_q10.pkl")
    print("  freight_q50.pkl")
    print("  freight_q90.pkl")
    print("  feature_names.pkl")


if __name__ == "__main__":
    train_models()