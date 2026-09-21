"""Tests for spot-vs-term, idle management and the risk alert engine."""

from __future__ import annotations

import pytest

from ml.decision.contract_strategy import compare_spot_vs_term, term_premium_factor
from ml.decision.idle_management import analyse_idle, estimate_berth_wait_days
from ml.risk.alerts import build_risk_report


class TestTermPremium:
    def test_premium_grows_with_duration(self):
        assert term_premium_factor(30) < term_premium_factor(90) < term_premium_factor(365)

    def test_premium_is_always_above_spot(self):
        assert all(term_premium_factor(d) > 1.0 for d in (1, 30, 90, 180, 365))

    def test_premium_flattens_out(self):
        assert term_premium_factor(3650) < 1.10


class TestSpotVsTerm:
    def _run(self, series, volatility, days=90, voyages=5):
        return compare_spot_vs_term(
            forecast_series=series,
            current_rate=series[0],
            cargo_quantity=300_000,
            contract_days=days,
            voyages_required=voyages,
            volatility=volatility,
        )

    def test_calm_market_prefers_spot(self, forecast_series):
        assert self._run(forecast_series, volatility=1.0)["recommendation"] == "SPOT"

    def test_volatile_market_prefers_term(self, forecast_series):
        assert self._run(forecast_series, volatility=8.0)["recommendation"] == "TERM"

    def test_there_is_a_crossover(self, forecast_series):
        """A model that always answers the same thing is not deciding anything."""
        picks = {self._run(forecast_series, v)["recommendation"] for v in (1.0, 4.5, 8.0, 12.0)}
        assert picks == {"SPOT", "TERM"}

    def test_fixtures_are_correlated_so_risk_does_not_vanish(self, forecast_series):
        """Independent draws would diversify the tail away as voyages grow."""
        few = self._run(forecast_series, volatility=6.0, voyages=2)
        many = self._run(forecast_series, volatility=6.0, voyages=12)

        def spread(result):
            return (result["spot_worst_case_usd"] - result["spot_best_case_usd"]) / result[
                "spot_expected_cost_usd"
            ]

        assert spread(many) > spread(few) * 0.5

    def test_cvar_is_at_least_the_expected_cost(self, forecast_series):
        result = self._run(forecast_series, volatility=6.0)
        assert result["spot_cvar80_cost_usd"] >= result["spot_expected_cost_usd"]

    def test_outcome_range_is_ordered(self, forecast_series):
        result = self._run(forecast_series, volatility=5.0)
        assert result["spot_best_case_usd"] <= result["spot_expected_cost_usd"]
        assert result["spot_expected_cost_usd"] <= result["spot_worst_case_usd"]

    def test_is_reproducible(self, forecast_series):
        assert self._run(forecast_series, 5.0) == self._run(forecast_series, 5.0)

    def test_probability_is_valid(self, forecast_series):
        assert 0.0 <= self._run(forecast_series, 5.0)["probability_term_cheaper"] <= 1.0

    def test_empty_series_does_not_crash(self):
        result = compare_spot_vs_term(
            forecast_series=[],
            current_rate=29.0,
            cargo_quantity=100_000,
            contract_days=30,
            voyages_required=1,
            volatility=2.0,
        )
        assert result["recommendation"] in {"SPOT", "TERM"}


class TestBerthWait:
    def test_queue_grows_with_congestion(self):
        waits = [estimate_berth_wait_days(c, berths=3) for c in (0.1, 0.4, 0.7, 0.95)]
        assert waits == sorted(waits)

    def test_growth_is_convex(self):
        """Doubling congestion should more than double the queue."""
        low = estimate_berth_wait_days(0.3, berths=3)
        high = estimate_berth_wait_days(0.6, berths=3)
        assert high > 2 * low

    def test_more_berths_absorb_the_queue(self):
        assert estimate_berth_wait_days(0.8, berths=5) < estimate_berth_wait_days(0.8, berths=1)

    @pytest.mark.parametrize("congestion", [-1.0, 0.0, 1.0, 5.0])
    def test_handles_out_of_range_input(self, congestion):
        assert estimate_berth_wait_days(congestion, berths=2) >= 0


class TestIdle:
    def _run(self, ports, discharge, congestion):
        return analyse_idle(
            vessel_type="Panamax",
            tonnes_per_voyage=70_000,
            load_port=ports["Newcastle"],
            discharge_port=ports[discharge],
            sea_days=17.9,
            load_congestion=0.3,
            discharge_congestion=congestion,
        )

    def test_days_account_for_the_whole_round_trip(self, ports):
        result = self._run(ports, "Gangavaram", 0.25)
        assert result["productive_days"] + result["idle_days"] == pytest.approx(
            result["total_round_trip_days"], rel=1e-6
        )

    def test_idle_share_is_a_fraction(self, ports):
        result = self._run(ports, "Gangavaram", 0.25)
        assert 0.0 <= result["idle_share"] <= 1.0

    def test_congestion_increases_demurrage(self, ports):
        calm = self._run(ports, "Gangavaram", 0.15)
        busy = self._run(ports, "Gangavaram", 0.85)
        assert busy["demurrage_cost_usd"] > calm["demurrage_cost_usd"]

    def test_slower_port_takes_longer_to_discharge(self, ports):
        fast = self._run(ports, "Gangavaram", 0.25)  # 45,000 t/day
        slow = self._run(ports, "Gopalpur", 0.25)  # 18,000 t/day
        assert slow["discharge_days"] > fast["discharge_days"]

    def test_always_returns_a_recommendation(self, ports):
        assert self._run(ports, "Gangavaram", 0.05)["recommendations"]

    def test_severe_congestion_raises_a_berth_warning(self, ports):
        result = self._run(ports, "Haldia", 0.9)
        assert any(r["type"] == "berth_congestion" for r in result["recommendations"])


class TestRiskAlerts:
    def _report(self, ports, **overrides):
        kwargs = dict(
            forecast_best=27.0,
            forecast_expected=29.0,
            forecast_worst=31.0,
            load_port=ports["Newcastle"],
            discharge_port=ports["Paradip"],
            load_congestion=0.2,
            discharge_congestion=0.2,
            vessel_supply=20,
            available_vessels=3,
            net_expected_saving=5.0,
            waiting_cost=0.5,
            probability_waiting_wins=0.8,
        )
        kwargs.update(overrides)
        return build_risk_report(**kwargs)

    def test_quiet_lane_is_low_risk(self, ports):
        assert self._report(ports)["overall_risk"] == "LOW"

    def test_severe_congestion_is_critical(self, ports):
        assert self._report(ports, discharge_congestion=0.9)["overall_risk"] == "CRITICAL"

    def test_wide_band_raises_a_volatility_alert(self, ports):
        report = self._report(ports, forecast_best=20.0, forecast_worst=42.0)
        assert any(a["category"] == "volatility" for a in report["alerts"])

    def test_no_open_vessels_is_critical(self, ports):
        assert self._report(ports, available_vessels=0)["overall_risk"] == "CRITICAL"

    def test_alerts_are_sorted_most_severe_first(self, ports):
        order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
        report = self._report(ports, discharge_congestion=0.9, vessel_supply=5)
        ranks = [order[a["severity"]] for a in report["alerts"]]
        assert ranks == sorted(ranks)

    def test_coin_flip_timing_flags_low_conviction(self, ports):
        report = self._report(ports, probability_waiting_wins=0.5)
        assert any(a["category"] == "decision" for a in report["alerts"])

    def test_clear_report_still_carries_one_entry(self, ports):
        report = self._report(ports)
        assert report["alert_count"] == 0
        assert len(report["alerts"]) == 1
