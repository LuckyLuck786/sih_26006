"""
Feature pipeline for the freight-rate forecasting model.

One correctness note that matters a great deal here. The first version
computed lags and rolling statistics across the whole dataframe. That was
safe only because the dataset held a single lane. The dataset now carries
140 distinct origin/destination/class series interleaved, so a global
shift(1) would read the previous row from a *different lane* — the last
Capesize value leaking into the first Handysize row.

Every temporal feature is therefore computed inside a groupby on the
series key, and the target is shifted inside the same groups.
"""

import numpy as np
import pandas as pd


DATA_PATH = "data/synthetic/freight_rate.csv"

# How far ahead the model forecasts.
#
# Next-day forecasting is close to unbeatable by persistence on a
# mean-reverting series, and it is not the question PS 26006 asks. The
# problem statement is about identifying an entry *window* for a short or
# mid-term charter, so the model targets the rate two weeks out, where
# seasonality, congestion and supply carry real signal.
FORECAST_HORIZON_DAYS = 14

# The columns that jointly identify one time series.
SERIES_KEYS = ["origin", "destination", "vessel_type"]

NUMERIC_COLUMNS = [
    "freight_rate",
    "commodity_price",
    "congestion",
    "vessel_supply",
    "distance_nm",
]

CATEGORICAL_COLUMNS = ["origin", "destination", "vessel_type"]


def load_data(path=DATA_PATH):
    """Load the freight-rate history."""

    df = pd.read_csv(path)
    print(f"Loaded {len(df):,} rows from {path}")
    return df


def clean_data(df):
    """Types, ordering, duplicates and missing values."""

    df = df.copy()

    df["date"] = pd.to_datetime(df["date"])

    df = df.sort_values(SERIES_KEYS + ["date"]).reset_index(drop=True)

    df = df.drop_duplicates(subset=SERIES_KEYS + ["date"]).reset_index(drop=True)

    for column in NUMERIC_COLUMNS:
        if column in df.columns:
            df[column] = (
                df.groupby(SERIES_KEYS, observed=True)[column]
                .transform(lambda s: s.interpolate().bfill().ffill())
            )

    for column in CATEGORICAL_COLUMNS:
        df[column] = df[column].fillna("Unknown")

    return df


def create_features(df):
    """
    Temporal features, computed within each series.

    Every lag and rolling window is grouped so no value crosses a lane
    boundary.
    """

    df = df.copy()

    df["day"] = df["date"].dt.day
    df["month"] = df["date"].dt.month
    df["day_of_week"] = df["date"].dt.dayofweek
    df["day_of_year"] = df["date"].dt.dayofyear

    # Seasonality as smooth cyclical features rather than a raw integer,
    # so December and January sit next to each other.
    df["season_sin"] = np.sin(2 * np.pi * df["day_of_year"] / 365.0)
    df["season_cos"] = np.cos(2 * np.pi * df["day_of_year"] / 365.0)

    grouped = df.groupby(SERIES_KEYS, observed=True)["freight_rate"]

    for lag in (1, 3, 7, 14):
        df[f"freight_rate_lag_{lag}"] = grouped.shift(lag)

    # Rolling windows are shifted by one first so the feature for day t
    # never contains day t's own rate, then applied through transform so
    # the window stays inside the series.
    for window in (7, 14, 30):
        df[f"freight_rate_rolling_mean_{window}"] = grouped.transform(
            lambda s, w=window: s.shift(1).rolling(w).mean()
        )

    for window in (7, 30):
        df[f"freight_rate_rolling_std_{window}"] = grouped.transform(
            lambda s, w=window: s.shift(1).rolling(w).std()
        )

    df["freight_rate_change"] = grouped.pct_change()

    # Momentum: where the rate sits against its own recent mean.
    df["rate_vs_mean_7"] = (
        df["freight_rate"] / df["freight_rate_rolling_mean_7"] - 1.0
    )

    # Supply and congestion carry signal of their own.
    congestion_grouped = df.groupby(SERIES_KEYS, observed=True)["congestion"]
    df["congestion_lag_1"] = congestion_grouped.shift(1)
    df["congestion_rolling_mean_7"] = congestion_grouped.transform(
        lambda s: s.shift(1).rolling(7).mean()
    )

    supply_grouped = df.groupby(SERIES_KEYS, observed=True)["vessel_supply"]
    df["vessel_supply_lag_1"] = supply_grouped.shift(1)

    df = df.dropna().reset_index(drop=True)

    return df


def encode_features(df):
    """One-hot encode the categorical columns."""

    df = df.copy()

    return pd.get_dummies(df, columns=CATEGORICAL_COLUMNS, dtype=int)


def preprocess_data(path=DATA_PATH):
    """Run the full pipeline."""

    print("\n1. Loading data...")
    df = load_data(path)

    print("2. Cleaning data...")
    df = clean_data(df)

    print("3. Creating features...")
    df = create_features(df)

    # The target is built before encoding so the groupby uses the real
    # key columns rather than reconstructed dummy columns.
    df["target"] = (
        df.groupby(SERIES_KEYS, observed=True)["freight_rate"]
        .shift(-FORECAST_HORIZON_DAYS)
    )
    df = df.dropna(subset=["target"]).reset_index(drop=True)

    print("4. Encoding categorical features...")
    encoded = encode_features(df)

    print("5. Preparing X and y...")

    drop_columns = [c for c in ["date", "target", "origin_port"] if c in encoded.columns]

    X = encoded.drop(columns=drop_columns)
    y = encoded["target"]

    return X, y, encoded


if __name__ == "__main__":

    X, y, processed = preprocess_data()

    print("\n" + "=" * 46)
    print("PREPROCESSING COMPLETE")
    print("=" * 46)
    print(f"\nProcessed shape : {processed.shape}")
    print(f"X shape         : {X.shape}")
    print(f"y shape         : {y.shape}")
    print(f"\nFeature count   : {len(X.columns)}")
    print(f"Target mean     : {y.mean():.2f}")
    print(f"Target std      : {y.std():.2f}")
