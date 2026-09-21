"""End-to-end tests for the decision pipeline and the vessel lookup modules.

These touch the trained models and the full rate history, so they are
marked slow. Run the fast suite with:

    pytest -m "not slow"
"""

from __future__ import annotations

import pytest

from ml import pipeline
from src.availability import get_available_vessels, get_route_distance
from src.compatibility import check_port_compatibility, get_port
from src.recommender import recommend_vessel

PS_ORIGINS = ["Australia", "Indonesia", "Mozambique", "Russia", "United States"]

PS_PORTS = [
    "Paradip",
    "Vizag",
    "Gangavaram",
    "Gopalpur",
    "Dhamra",
    "Haldia",
    "Sagar-Sandheads",
]


class TestReferenceDataCoversTheProblemStatement:
    def test_every_named_origin_is_present(self, ports):
        countries = {p["country"] for p in ports.values() if p["role"] == "load"}
        assert set(PS_ORIGINS) <= countries

    def test_every_named_discharge_port_is_present(self, ports):
        discharge = {p["port"] for p in ports.values() if p["role"] == "discharge"}
        assert set(PS_PORTS) <= discharge

    def test_all_four_vessel_classes_are_modelled(self, vessel_classes):
        names = {spec["vessel_type"] for spec in vessel_classes}
        assert names == {"Handysize", "Supramax", "Panamax", "Capesize"}

    def test_ports_carry_the_restrictions_the_ps_names(self, ports):
        for port in ports.values():
            for field in ("max_draft", "max_LOA", "max_beam", "cargo_handling_rate"):
                assert port[field] > 0, f"{port['port']} missing {field}"

    @pytest.mark.parametrize("origin", PS_ORIGINS)
    def test_every_origin_reaches_every_discharge_port(self, origin, routes):
        reachable = {route["destination"] for route in routes if route["origin_country"] == origin}
        assert set(PS_PORTS) <= reachable


class TestRouteLookup:
    """Regression tests: these lanes used to resolve to None."""

    def test_international_lane_resolves(self):
        assert get_route_distance("Newcastle", "Paradip") is not None

    def test_distance_is_plausible_for_australia_india(self):
        distance = get_route_distance("Newcastle", "Paradip")
        assert 4_000 < distance < 8_000

    def test_reverse_direction_resolves(self):
        assert get_route_distance("Paradip", "Newcastle") == get_route_distance(
            "Newcastle", "Paradip"
        )

    def test_unknown_lane_returns_none(self):
        assert get_route_distance("Atlantis", "Paradip") is None

    def test_available_vessels_found_at_a_load_port(self):
        assert get_available_vessels("Newcastle", "Paradip", "Panamax") is not None


class TestPortCompatibility:
    def test_known_port_is_found(self):
        assert get_port("Sagar-Sandheads") is not None

    def test_unknown_port_is_rejected(self):
        assert check_port_compatibility({"draft": 10, "LOA": 100, "beam": 20}, "Nowhere") == {
            "valid": False,
            "reason": "Port not found",
        }

    def test_oversized_vessel_is_rejected_with_a_reason(self):
        capesize = {"draft": 18.2, "LOA": 292, "beam": 45}
        result = check_port_compatibility(capesize, "Haldia")
        assert result["valid"] is False
        assert "LOA" in result["reason"]

    def test_small_vessel_fits_a_deep_port(self):
        handysize = {"draft": 10.0, "LOA": 180, "beam": 28}
        assert check_port_compatibility(handysize, "Gangavaram")["valid"] is True


class TestRecommender:
    def test_recommender_returns_a_structured_result(self):
        result = recommend_vessel("Newcastle", "Paradip", "Panamax")
        assert "recommended" in result


@pytest.mark.slow
class TestDecisionPipeline:
    @staticmethod
    @pytest.fixture(scope="class")
    def result():
        return pipeline.run_decision_pipeline(
            origin="Australia",
            destination="Paradip",
            cargo_quantity=120_000,
            contract_duration_days=90,
        )

    def test_the_flagship_lane_returns_a_decision(self, result):
        """Australia -> Paradip used to return 'No available vessels found'."""
        assert result["vessel_recommendation"]["chosen"] is not None

    def test_response_covers_every_requirement(self, result):
        for key in (
            "forecast",
            "forecast_series",
            "decision",
            "optimal_timing",
            "vessel_recommendation",
            "idle",
            "contract_strategy",
            "risk",
        ):
            assert key in result, f"missing {key}"

    def test_forecast_quantiles_are_ordered(self, result):
        forecast = result["forecast"]
        assert forecast["best"] <= forecast["expected"] <= forecast["worst"]

    def test_forecast_series_spans_the_horizon(self, result):
        series = result["forecast_series"]
        assert len(series) == result["forecast"]["horizon_days"] + 1
        assert series[0]["day"] == 0

    def test_band_widens_with_horizon(self, result):
        series = result["forecast_series"]
        first = series[1]["upper"] - series[1]["lower"]
        last = series[-1]["upper"] - series[-1]["lower"]
        assert last > first

    def test_nearest_load_port_is_chosen(self, result):
        """Port Hedland is closer to India than Newcastle."""
        assert result["route"]["load_port"] == "Port Hedland"

    def test_decision_is_one_of_two_values(self, result):
        assert result["decision"]["decision"] in {"WAIT", "CHARTER NOW"}

    @pytest.mark.parametrize("destination", PS_PORTS)
    def test_every_discharge_port_runs(self, destination):
        outcome = pipeline.run_decision_pipeline(
            origin="Australia", destination=destination, cargo_quantity=60_000
        )
        assert outcome["vessel_recommendation"]["chosen"] is not None

    def test_unknown_lane_raises_value_error(self):
        with pytest.raises(ValueError):
            pipeline.run_decision_pipeline(
                origin="Atlantis", destination="Paradip", cargo_quantity=50_000
            )

    def test_larger_parcel_needs_more_voyages(self):
        small = pipeline.run_decision_pipeline(
            origin="Australia", destination="Haldia", cargo_quantity=20_000
        )
        large = pipeline.run_decision_pipeline(
            origin="Australia", destination="Haldia", cargo_quantity=250_000
        )
        assert (
            large["vessel_recommendation"]["chosen"]["voyages_required"]
            > small["vessel_recommendation"]["chosen"]["voyages_required"]
        )
