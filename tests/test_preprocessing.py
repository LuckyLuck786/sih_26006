"""Tests for the feature pipeline.

The important one here is cross-lane leakage. The original code computed
lags and rolling windows across the whole dataframe. With many series
interleaved that reads the previous row from a *different* lane, which
silently corrupts every temporal feature and inflates apparent accuracy.
These tests pin that behaviour with a small hand-built frame rather than
the full dataset, so they stay fast and the assertion is exact.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from ml.preprocessing.preprocess import (
    FORECAST_HORIZON_DAYS,
    SERIES_KEYS,
    clean_data,
    create_features,
    encode_features,
)


@pytest.fixture
def two_lanes() -> pd.DataFrame:
    """Two lanes with deliberately disjoint rate levels.

    Lane A sits near 10, lane B near 100. Any feature that mixes them is
    obvious by inspection.
    """
    days = pd.date_range("2025-01-01", periods=60, freq="D")

    def lane(origin, destination, vessel_type, level):
        return pd.DataFrame(
            {
                "date": days,
                "origin": origin,
                "destination": destination,
                "vessel_type": vessel_type,
                "distance_nm": 4000,
                "freight_rate": level + np.arange(len(days)) * 0.1,
                "commodity_price": 110.0,
                "congestion": 0.2,
                "vessel_supply": 25,
            }
        )

    return pd.concat(
        [
            lane("Australia", "Paradip", "Panamax", 10.0),
            lane("Indonesia", "Vizag", "Capesize", 100.0),
        ],
        ignore_index=True,
    )


class TestNoCrossLaneLeakage:
    def test_lag_never_crosses_a_lane_boundary(self, two_lanes):
        features = create_features(clean_data(two_lanes))

        for _, group in features.groupby(SERIES_KEYS, observed=True):
            # Within a lane the level is stable, so lag_1 must stay close
            # to the rate itself. A leaked value from the other lane would
            # be off by roughly 90.
            assert (group["freight_rate"] - group["freight_rate_lag_1"]).abs().max() < 1.0

    def test_rolling_mean_stays_inside_its_lane(self, two_lanes):
        features = create_features(clean_data(two_lanes))

        low = features[features["origin"] == "Australia"]
        high = features[features["origin"] == "Indonesia"]

        assert low["freight_rate_rolling_mean_7"].max() < 50
        assert high["freight_rate_rolling_mean_7"].min() > 50

    def test_rolling_window_excludes_the_current_day(self, two_lanes):
        """A window containing day t's own rate leaks the target.

        create_features drops the rows the window could not fill, so the
        expected values are computed on the cleaned frame and then joined
        back by date rather than recomputed on the filtered output.
        """
        cleaned = clean_data(two_lanes)
        features = create_features(cleaned)

        source = cleaned[cleaned["origin"] == "Australia"].sort_values("date")
        expected = source.assign(
            manual=source["freight_rate"].shift(1).rolling(7).mean()
        ).set_index("date")["manual"]

        lane = features[features["origin"] == "Australia"].set_index("date")

        assert lane["freight_rate_rolling_mean_7"].equals(
            expected.loc[lane.index].rename("freight_rate_rolling_mean_7")
        )

    def test_target_shift_stays_inside_its_lane(self, two_lanes):
        cleaned = clean_data(two_lanes)
        features = create_features(cleaned)

        features["target"] = features.groupby(SERIES_KEYS, observed=True)["freight_rate"].shift(
            -FORECAST_HORIZON_DAYS
        )

        valid = features.dropna(subset=["target"])

        for _, group in valid.groupby(SERIES_KEYS, observed=True):
            assert (group["freight_rate"] - group["target"]).abs().max() < 5.0


class TestCleaning:
    def test_duplicate_dates_within_a_lane_are_dropped(self, two_lanes):
        doubled = pd.concat([two_lanes, two_lanes.head(5)], ignore_index=True)
        cleaned = clean_data(doubled)
        assert not cleaned.duplicated(subset=[*SERIES_KEYS, "date"]).any()

    def test_same_date_in_different_lanes_is_kept(self, two_lanes):
        cleaned = clean_data(two_lanes)
        counts = cleaned.groupby("date").size()
        assert counts.max() == 2

    def test_missing_numeric_values_are_filled(self, two_lanes):
        holed = two_lanes.copy()
        holed.loc[5:8, "freight_rate"] = np.nan
        assert not clean_data(holed)["freight_rate"].isna().any()

    def test_dates_are_parsed(self, two_lanes):
        assert pd.api.types.is_datetime64_any_dtype(clean_data(two_lanes)["date"])


class TestFeatures:
    def test_seasonality_is_cyclical(self, two_lanes):
        features = create_features(clean_data(two_lanes))
        unit = features["season_sin"] ** 2 + features["season_cos"] ** 2
        assert unit.min() == pytest.approx(1.0, abs=1e-9)

    def test_no_nulls_survive(self, two_lanes):
        assert not create_features(clean_data(two_lanes)).isna().any().any()

    def test_encoding_produces_one_column_per_category(self, two_lanes):
        encoded = encode_features(create_features(clean_data(two_lanes)))
        assert "origin_Australia" in encoded.columns
        assert "vessel_type_Capesize" in encoded.columns
        assert "origin" not in encoded.columns

    def test_encoded_categories_are_not_constant(self, two_lanes):
        """A single-lane dataset made every dummy column constant, so the
        model could not distinguish routes at all."""
        encoded = encode_features(create_features(clean_data(two_lanes)))
        assert encoded["origin_Australia"].nunique() == 2
