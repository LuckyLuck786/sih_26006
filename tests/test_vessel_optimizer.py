"""Tests for vessel-class optimisation (PS 26006 requirement b)."""

from __future__ import annotations

import pytest

from ml.decision.vessel_optimizer import (
    UNDER_KEEL_CLEARANCE_M,
    draft_limited_payload,
    rank_vessel_classes,
)


@pytest.fixture
def rates():
    return {"Handysize": 34.0, "Supramax": 28.0, "Panamax": 24.0, "Capesize": 18.0}


class TestDraftLimitedPayload:
    def test_deep_port_allows_full_deadweight(self):
        assert draft_limited_payload(76_000, 14.2, 20.0) == 76_000

    def test_exactly_at_limit_including_clearance(self):
        payload = draft_limited_payload(76_000, 14.2, 14.2 + UNDER_KEEL_CLEARANCE_M)
        assert payload == 76_000

    def test_shallow_port_limits_payload_without_excluding_vessel(self):
        # Haldia is 8.5 m; a Panamax loads to summer draft 14.2 m.
        payload = draft_limited_payload(76_000, 14.2, 8.5)
        assert 0 < payload < 76_000
        # Roughly a third of deadweight, which is what part-laden means.
        assert 20_000 < payload < 40_000

    def test_vessel_that_cannot_float_returns_zero(self):
        # Lightship draft is 35% of summer draft: 18.2 * 0.35 = 6.37 m.
        assert draft_limited_payload(180_000, 18.2, 5.0) == 0.0

    def test_payload_increases_monotonically_with_available_draft(self):
        payloads = [draft_limited_payload(76_000, 14.2, d) for d in (9, 11, 13, 15)]
        assert payloads == sorted(payloads)


class TestRanking:
    def test_deep_port_prefers_largest_class(self, ports, vessel_classes, rates):
        result = rank_vessel_classes(
            vessel_classes, ports["Newcastle"], ports["Gangavaram"], 120_000, 5793, rates
        )
        assert result["recommended"]["vessel_type"] == "Capesize"
        assert not result["rejected"]

    def test_ranked_by_ascending_cost_per_tonne(self, ports, vessel_classes, rates):
        result = rank_vessel_classes(
            vessel_classes, ports["Newcastle"], ports["Gangavaram"], 120_000, 5793, rates
        )
        costs = [option["cost_per_tonne_usd"] for option in result["ranked"]]
        assert costs == sorted(costs)
        assert [o["rank"] for o in result["ranked"]] == [1, 2, 3, 4]

    def test_haldia_rejects_on_loa_and_beam_with_reasons(self, ports, vessel_classes, rates):
        result = rank_vessel_classes(
            vessel_classes, ports["Newcastle"], ports["Haldia"], 120_000, 5793, rates
        )
        rejected = {o["vessel_type"]: o["reasons"] for o in result["rejected"]}

        assert "Capesize" in rejected
        assert "Panamax" in rejected
        assert any("LOA" in reason for reason in rejected["Capesize"])
        assert any("Beam" in reason for reason in rejected["Panamax"])

    def test_shallow_port_is_more_expensive_per_tonne(self, ports, vessel_classes, rates):
        deep = rank_vessel_classes(
            vessel_classes, ports["Newcastle"], ports["Gangavaram"], 120_000, 5793, rates
        )
        shallow = rank_vessel_classes(
            vessel_classes, ports["Newcastle"], ports["Haldia"], 120_000, 5793, rates
        )
        assert (
            shallow["recommended"]["cost_per_tonne_usd"] > deep["recommended"]["cost_per_tonne_usd"]
        )

    def test_draft_limit_forces_multiple_voyages(self, ports, vessel_classes, rates):
        result = rank_vessel_classes(
            vessel_classes, ports["Newcastle"], ports["Haldia"], 120_000, 5793, rates
        )
        assert result["recommended"]["voyages_required"] > 1

    def test_binding_port_is_reported(self, ports, vessel_classes, rates):
        result = rank_vessel_classes(
            vessel_classes, ports["Newcastle"], ports["Haldia"], 120_000, 5793, rates
        )
        assert result["recommended"]["binding_port"] == "Haldia"

    def test_saving_vs_next_best_is_positive_when_alternatives_exist(
        self, ports, vessel_classes, rates
    ):
        result = rank_vessel_classes(
            vessel_classes, ports["Newcastle"], ports["Gangavaram"], 120_000, 5793, rates
        )
        assert result["saving_vs_next_best_usd"] > 0

    def test_cost_components_sum_to_total(self, ports, vessel_classes, rates):
        result = rank_vessel_classes(
            vessel_classes, ports["Newcastle"], ports["Paradip"], 120_000, 5793, rates
        )
        option = result["recommended"]
        parts = (
            option["freight_cost_usd"]
            + option["hire_cost_usd"]
            + option["bunker_cost_usd"]
            + option["port_charges_usd"]
        )
        assert parts == pytest.approx(option["total_cost_usd"], rel=1e-6)
