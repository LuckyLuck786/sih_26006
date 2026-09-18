import pandas as pd

from ml.preprocessing.preprocess import (
    load_data,
    clean_data,
    create_features,
    encode_features
)

from ml.forecasting.predict import predict_forecast

from ml.pipeline import run_decision_pipeline


DATA_PATH = "data/synthetic/freight_rate.csv"


def main():

    # -----------------------------
    # 1. Load data
    # -----------------------------

    df = load_data(DATA_PATH)

    # -----------------------------
    # 2. Preprocess
    # -----------------------------

    df = clean_data(df)
    df = create_features(df)
    df = encode_features(df)

    # -----------------------------
    # 3. Select latest row
    # -----------------------------

    latest_row = df.iloc[[-1]].copy()

    current_rate = float(
        latest_row["freight_rate"].iloc[0]
    )

    # -----------------------------
    # 4. Prepare model input
    # -----------------------------

    X = latest_row.drop(
        columns=["date"]
    )

    # Remove target if present
    if "target" in X.columns:
        X = X.drop(columns=["target"])

    # -----------------------------
    # 5. Forecast
    # -----------------------------

    forecast = predict_forecast(X)

    print("\nForecast:")
    print(forecast)

    # -----------------------------
    # 6. Decision pipeline
    # -----------------------------

    result = run_decision_pipeline(

        current_rate=current_rate,

        forecast_best=forecast["best"],

        forecast_expected=forecast["expected"],

        forecast_worst=forecast["worst"],

        cargo_quantity=50000,

        cargo_value_per_ton=10000,

        annual_carrying_rate=0.08,

        storage_cost_per_day=100000,

        operational_delay_cost_per_day=50000
    )

    # -----------------------------
    # 7. Display result
    # -----------------------------

    print("\n========================================")
    print("FINAL FORECAST-TO-DECISION RESULT")
    print("========================================")

    print("\nCurrent Rate:")
    print(current_rate)

    print("\nForecast:")
    print(forecast)

    print("\nCharter Decision:")
    print(
        result["charter_decision"]
    )

    print("\nMonte Carlo:")
    print(
        result["monte_carlo"]
    )


if __name__ == "__main__":
    main()