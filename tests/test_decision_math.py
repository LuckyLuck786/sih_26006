"""Tests for waiting cost, the charter/wait call, Monte Carlo and optimal stopping."""

from __future__ import annotations

import pytest

from ml.decision.charter_decision import calculate_charter_decision
from ml.decision.longstaff_schwartz import LongstaffSchwartz
from ml.decision.monte_carlo import monte_carlo_simulation
from ml.decision.regret import calculate_regret
from ml.decision.waiting_cost import calculate_waiting_cost


class TestWaitingCost:
    def test_daily_carrying_cost_is_annual_rate_over_365(self):
        result = calculate_waiting_cost(
            cargo_quantity=50_000, cargo_value_per_ton=10_000, annual_carrying_rate=0.08
        )
        assert result["cargo_value"] == 500_000_000
        assert result["daily_carrying_cost"] == pytest.approx(500_000_000 * 0.08 / 365, rel=1e-6)

    def test_extra_costs_are_added(self):
        base = calculate_waiting_cost(50_000, 10_000, 0.08)
        with_extras = calculate_waiting_cost(
            50_000, 10_000, 0.08, storage_cost_per_day=1_000, operational_delay_cost_per_day=500
        )
        assert with_extras["waiting_cost_per_day"] == pytest.approx(
            base["waiting_cost_per_day"] + 1_500
        )

    def test_zero_carrying_rate_gives_zero_base_cost(self):
        result = calculate_waiting_cost(50_000, 10_000, 0.0)
        assert result["waiting_cost_per_day"] == 0


class TestCharterDecision:
    def test_waits_when_forecast_falls_below_current(self):
        result = calculate_charter_decision(32.0, 27.0, 29.0, 35.0, waiting_cost=0.5)
        assert result["decision"] == "WAIT"
        assert result["net_expected_saving"] > 0

    def test_charters_now_when_forecast_rises(self):
        result = calculate_charter_decision(24.0, 27.0, 29.0, 35.0, waiting_cost=0.5)
        assert result["decision"] == "CHARTER NOW"

    def test_waiting_cost_can_flip_the_call(self):
        cheap = calculate_charter_decision(30.0, 28.0, 29.0, 30.0, waiting_cost=0.1)
        dear = calculate_charter_decision(30.0, 28.0, 29.0, 30.0, waiting_cost=5.0)
        assert cheap["decision"] == "WAIT"
        assert dear["decision"] == "CHARTER NOW"

    @pytest.mark.parametrize(
        "best,worst,expected_risk",
        [(28.5, 29.5, "LOW"), (26.0, 31.0, "MEDIUM"), (20.0, 40.0, "HIGH")],
    )
    def test_risk_band_widens_with_uncertainty(self, best, worst, expected_risk):
        result = calculate_charter_decision(30.0, best, 29.0, worst, waiting_cost=0.1)
        assert result["risk"] == expected_risk

    def test_confidence_stays_within_bounds(self):
        result = calculate_charter_decision(30.0, 1.0, 29.0, 90.0, waiting_cost=0.1)
        assert 0.0 <= result["confidence"] <= 1.0

    def test_zero_expected_forecast_does_not_divide_by_zero(self):
        result = calculate_charter_decision(30.0, 0.0, 0.0, 0.0, waiting_cost=0.1)
        assert result["confidence"] == 1.0


class TestMonteCarlo:
    def test_is_reproducible(self):
        kwargs = dict(
            current_rate=32.0, forecast_best=27.0, forecast_expected=29.0, forecast_worst=35.0
        )
        assert monte_carlo_simulation(**kwargs) == monte_carlo_simulation(**kwargs)

    def test_probabilities_are_valid(self):
        result = monte_carlo_simulation(32.0, 27.0, 29.0, 35.0, waiting_cost=0.5)
        for key in (
            "probability_of_saving",
            "probability_rate_increase",
            "probability_rate_decrease",
        ):
            assert 0.0 <= result[key] <= 1.0

    def test_percentiles_are_ordered(self):
        result = monte_carlo_simulation(32.0, 27.0, 29.0, 35.0, waiting_cost=0.5)
        assert result["simulated_q10"] <= result["simulated_q50"] <= result["simulated_q90"]

    def test_rates_never_go_negative(self):
        result = monte_carlo_simulation(1.0, 0.1, 0.5, 2.0, waiting_cost=0.0)
        assert result["simulated_q10"] >= 0


class TestOptimalStopping:
    """Regression tests for three bugs fixed in the Longstaff-Schwartz model."""

    def setup_method(self):
        self.model = LongstaffSchwartz(simulations=2000, time_steps=14)

    def test_falling_market_waits(self):
        result = self.model.run(32.0, 28.0, 26.0, 33.0, waiting_cost=0.08)
        assert result["decision"] == "WAIT"
        assert result["probability_waiting_wins"] > 0.5

    def test_rising_market_fixes_today(self):
        result = self.model.run(24.0, 29.0, 26.0, 33.0, waiting_cost=0.08)
        assert result["decision"] == "CHARTER NOW"
        assert result["charter_now_is_optimal"] is True

    def test_charter_now_probability_is_not_always_zero(self):
        """The backward loop used to stop at t=1, so day 0 was unreachable."""
        rising = self.model.run(24.0, 29.0, 26.0, 33.0, waiting_cost=0.08)
        falling = self.model.run(32.0, 28.0, 26.0, 33.0, waiting_cost=0.08)
        assert rising["charter_now_is_optimal"] != falling["charter_now_is_optimal"]

    def test_higher_waiting_cost_shortens_the_wait(self):
        """Waiting cost used to be charged inversely, so waiting longer cost less."""
        cheap = self.model.run(32.0, 28.0, 26.0, 33.0, waiting_cost=0.01)
        dear = self.model.run(32.0, 28.0, 26.0, 33.0, waiting_cost=2.0)
        assert dear["optimal_waiting_days"] <= cheap["optimal_waiting_days"]

    def test_is_reproducible(self):
        args = (32.0, 28.0, 26.0, 33.0)
        assert self.model.run(*args, waiting_cost=0.08) == self.model.run(*args, waiting_cost=0.08)

    def test_stopping_distribution_covers_the_horizon(self):
        result = self.model.run(32.0, 28.0, 26.0, 33.0, waiting_cost=0.08)
        assert len(result["stopping_day_distribution"]) == 15
        assert sum(result["stopping_day_distribution"]) == result["simulations"]

    def test_forecast_is_actually_used(self):
        """forecast_expected was accepted and ignored in the first version."""
        low = self.model.run(30.0, 20.0, 18.0, 24.0, waiting_cost=0.05)
        high = self.model.run(30.0, 40.0, 36.0, 46.0, waiting_cost=0.05)
        assert low["expected_cost_if_waiting"] < high["expected_cost_if_waiting"]


class TestRegret:
    def test_module_imports_without_error(self):
        """print(result) used to sit outside the __main__ guard."""
        assert callable(calculate_regret)

    def test_waiting_regrets_when_rates_rise(self):
        result = calculate_regret(5_000, 5_300, "WAIT", 50_000)
        assert result["regret_per_ton"] == 300
        assert result["total_regret"] == 15_000_000

    def test_no_regret_when_the_call_was_right(self):
        assert calculate_regret(5_000, 4_800, "WAIT", 50_000)["regret_per_ton"] == 0
