import pandas as pd

DATA_PATH = "data/synthetic/freight_rate.csv"


def main():
    print("Loading freight data...")

    df = pd.read_csv(DATA_PATH)

    print("\nDataset loaded successfully!")
    print(f"Rows: {len(df)}")
    print(f"Columns: {len(df.columns)}")

    print("\nColumns:")
    print(df.columns.tolist())

    print("\nFirst 5 rows:")
    print(df.head())

    print("\nData types:")
    print(df.dtypes)

    print("\nMissing values:")
    print(df.isnull().sum())

    print("\nBasic statistics:")
    print(df.describe())


if __name__ == "__main__":
    main()