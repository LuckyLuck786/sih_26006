import pandas as pd
import numpy as np


# ============================================================
# CONFIGURATION
# ============================================================

DATA_PATH = "data/synthetic/freight_rate.csv"


# ============================================================
# LOAD DATA
# ============================================================

def load_data(path=DATA_PATH):
    """
    Load the freight-rate CSV file.

    Returns:
        pandas.DataFrame
    """

    df = pd.read_csv(path)

    print(f"Loaded {len(df)} rows from {path}")

    return df


# ============================================================
# BASIC CLEANING
# ============================================================

def clean_data(df):
    """
    Perform basic data cleaning.

    Steps:
    1. Convert date to datetime
    2. Sort by date
    3. Remove duplicate rows
    4. Handle missing values
    """

    df = df.copy()

    # Convert date column
    df["date"] = pd.to_datetime(df["date"])

    # Sort chronologically
    df = df.sort_values("date").reset_index(drop=True)

    # Remove duplicate rows
    df = df.drop_duplicates().reset_index(drop=True)

    # Handle missing numeric values
    numeric_columns = [
        "freight_rate",
        "commodity_price",
        "congestion",
        "vessel_supply"
    ]

    for column in numeric_columns:
        df[column] = df[column].interpolate()
        df[column] = df[column].bfill()
        df[column] = df[column].ffill()

    # Handle missing categorical values
    categorical_columns = [
        "origin",
        "destination",
        "vessel_type"
    ]

    for column in categorical_columns:
        df[column] = df[column].fillna("Unknown")

    return df


# ============================================================
# FEATURE ENGINEERING
# ============================================================

def create_features(df):
    """
    Create features that will later be used by the
    freight-rate forecasting model.
    """

    df = df.copy()

    # --------------------------------------------------------
    # Date features
    # --------------------------------------------------------

    df["day"] = df["date"].dt.day
    df["month"] = df["date"].dt.month
    df["day_of_week"] = df["date"].dt.dayofweek

    # --------------------------------------------------------
    # Freight-rate lag features
    # --------------------------------------------------------

    # Previous day's freight rate
    df["freight_rate_lag_1"] = df["freight_rate"].shift(1)

    # Freight rate 3 days ago
    df["freight_rate_lag_3"] = df["freight_rate"].shift(3)

    # Freight rate 7 days ago
    df["freight_rate_lag_7"] = df["freight_rate"].shift(7)

    # --------------------------------------------------------
    # Rolling statistics
    # --------------------------------------------------------

    # 7-day average
    df["freight_rate_rolling_mean_7"] = (
        df["freight_rate"]
        .rolling(window=7)
        .mean()
    )

    # 7-day standard deviation
    df["freight_rate_rolling_std_7"] = (
        df["freight_rate"]
        .rolling(window=7)
        .std()
    )

    # --------------------------------------------------------
    # Freight rate change
    # --------------------------------------------------------

    df["freight_rate_change"] = (
        df["freight_rate"]
        .pct_change()
    )

    # --------------------------------------------------------
    # Remove rows created by lag/rolling operations
    # --------------------------------------------------------

    df = df.dropna().reset_index(drop=True)

    return df


# ============================================================
# ENCODE CATEGORICAL FEATURES
# ============================================================

def encode_features(df):
    """
    Convert categorical variables into numerical values.

    For this first prototype we use one-hot encoding.
    """

    df = df.copy()

    categorical_columns = [
        "origin",
        "destination",
        "vessel_type"
    ]

    df = pd.get_dummies(
        df,
        columns=categorical_columns,
        dtype=int
    )

    return df


# ============================================================
# CREATE X AND Y
# ============================================================

def prepare_model_data(df):
    """
    Separate model features (X) and target (y).

    Target:
        Next day's freight rate.
    """

    df = df.copy()

    # Predict NEXT day's freight rate
    df["target"] = df["freight_rate"].shift(-1)

    # Remove final row because it has no future target
    df = df.dropna().reset_index(drop=True)

    # Columns that should NOT be used directly as features
    columns_to_remove = [
        "date",
        "target"
    ]

    X = df.drop(columns=columns_to_remove)

    y = df["target"]

    return X, y


# ============================================================
# COMPLETE PREPROCESSING PIPELINE
# ============================================================

def preprocess_data(path=DATA_PATH):
    """
    Complete preprocessing pipeline.

    Returns:
        X -> model features
        y -> target values
        processed_df -> processed dataset
    """

    print("\n1. Loading data...")
    df = load_data(path)

    print("\n2. Cleaning data...")
    df = clean_data(df)

    print("\n3. Creating features...")
    df = create_features(df)

    print("\n4. Encoding categorical features...")
    df = encode_features(df)

    print("\n5. Preparing X and y...")
    X, y = prepare_model_data(df)

    return X, y, df


# ============================================================
# TEST
# ============================================================

if __name__ == "__main__":

    X, y, processed_df = preprocess_data()

    print("\n========================================")
    print("PREPROCESSING COMPLETE")
    print("========================================")

    print(f"\nProcessed dataset shape: {processed_df.shape}")

    print(f"\nX shape: {X.shape}")

    print(f"y shape: {y.shape}")

    print("\nFeatures:")
    print(X.columns.tolist())

    print("\nFirst 5 X rows:")
    print(X.head())

    print("\nFirst 5 target values:")
    print(y.head())

    print("\nTarget statistics:")
    print(y.describe())