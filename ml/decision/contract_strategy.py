"""
Spot versus term contract comparison.

This addresses the stated Objective of PS 26006 directly:

    "Development of model to facilitate moving from multiple single spot
     contracts being entered into currently to short term / medium term
     multiple voyage contracts."

The first prototype collected a contract duration in the UI and never
read it. This module uses it.

The economics: a term contract fixes one rate across every voyage in the
period. It removes upside if the market falls, but it removes the far
more damaging downside if the market rises, and it secures tonnage.
Owners price that certainty at a premium over the spot curve. The
question is whether the premium is worth less than the volatility it
removes, which is a risk-adjusted comparison, not a point estimate.
"""

import math

import numpy as np


# Owners quote term business above the expected spot level. The premium
# widens with duration because the owner carries more rate risk.
def term_premium_factor(contract_days):
    """Multiplier applied to mean expected spot to price a term deal."""

    months = contract_days / 30.0

    # ~3% for a one-month deal, rising and flattening out near 9%.
    return 1.0 + 0.09 * (1.0 - math.exp(-0.45 * months))


def compare_spot_vs_term(
    forecast_series,
    current_rate,
    cargo_quantity,
    contract_days,
    voyages_required,
    volatility,
    risk_aversion=0.5,
    simulations=4000,
    random_seed=26006,
):
    """
    Compare repeated spot fixtures against a single term contract.

    forecast_series:
        Iterable of expected rates per day over the horizon.

    volatility:
        Standard deviation of the rate, in the same units as the rates.

    risk_aversion:
        Weight applied to the downside of the spot distribution. 0 makes
        the comparison purely expected-cost; higher values penalise the
        uncertainty a procurement team actually cares about.
    """

    rng = np.random.default_rng(random_seed)

    series = list(forecast_series) or [current_rate]

    # Spread the voyages evenly across the contract period and read the
    # forecast at each fixture date.
    fixture_days = [
        min(
            round(i * contract_days / max(voyages_required, 1)),
            len(series) - 1,
        )
        for i in range(max(voyages_required, 1))
    ]

    expected_spot_at_fixture = [series[d] for d in fixture_days]

    mean_expected_spot = float(np.mean(expected_spot_at_fixture))

    # ------------------------------------------------------
    # Term price
    # ------------------------------------------------------

    premium = term_premium_factor(contract_days)

    term_rate = mean_expected_spot * premium

    term_total_cost = term_rate * cargo_quantity

    # ------------------------------------------------------
    # Spot: simulate each fixture independently around its forecast
    #
    # Uncertainty grows the further out the fixture sits, so scale the
    # volatility by the square root of the horizon fraction.
    # ------------------------------------------------------

    tonnes_per_voyage = cargo_quantity / max(voyages_required, 1)

    # Freight rates trend. Successive fixtures are NOT independent draws:
    # a market that has risen by voyage three is usually still elevated at
    # voyage four. Sampling each fixture independently would diversify the
    # risk away and make a term contract look pointless, which is exactly
    # the wrong answer for this problem statement.
    #
    # So the shock is split into a systematic component shared by every
    # fixture in a simulation, and an idiosyncratic component per fixture.
    SYSTEMATIC_SHARE = 0.75

    systematic_sigma = volatility * math.sqrt(SYSTEMATIC_SHARE)
    idiosyncratic_sigma = volatility * math.sqrt(1.0 - SYSTEMATIC_SHARE)

    # One market path per simulation, drawn once and applied to all
    # fixtures in that simulation.
    market_shock = rng.normal(0.0, 1.0, simulations)

    spot_totals = np.zeros(simulations)

    for index, day in enumerate(fixture_days):
        horizon_scale = math.sqrt((day + 1) / max(len(series), 1))

        systematic = market_shock * systematic_sigma * horizon_scale

        idiosyncratic = rng.normal(
            0.0,
            max(idiosyncratic_sigma * horizon_scale, 1e-9),
            simulations,
        )

        sampled = np.maximum(
            expected_spot_at_fixture[index] + systematic + idiosyncratic,
            0.0,
        )

        spot_totals += sampled * tonnes_per_voyage

    expected_spot_cost = float(np.mean(spot_totals))

    spot_p90_cost = float(np.percentile(spot_totals, 90))
    spot_p10_cost = float(np.percentile(spot_totals, 10))

    spot_std = float(np.std(spot_totals))

    # Conditional value at risk: the average of the worst 20% of
    # outcomes. This is what a procurement desk is actually protecting
    # against when it fixes term, so it drives the recommendation.
    var_80 = np.percentile(spot_totals, 80)
    tail = spot_totals[spot_totals >= var_80]
    spot_cvar_cost = float(np.mean(tail)) if tail.size else expected_spot_cost

    # ------------------------------------------------------
    # Risk-adjusted comparison
    #
    # The term deal is certain, so its risk-adjusted cost is its cost.
    # The spot programme is penalised for its dispersion.
    # ------------------------------------------------------

    spot_risk_adjusted = (1.0 - risk_aversion) * expected_spot_cost + risk_aversion * spot_cvar_cost

    probability_term_cheaper = float(np.mean(spot_totals > term_total_cost))

    if spot_risk_adjusted < term_total_cost:
        recommendation = "SPOT"
        rationale = (
            f"Repeated spot fixtures are expected to cost "
            f"${expected_spot_cost:,.0f} against ${term_total_cost:,.0f} "
            f"for a {contract_days}-day term contract. The term premium "
            f"of {(premium - 1) * 100:.1f}% outweighs the rate risk over "
            f"this horizon."
        )
    else:
        recommendation = "TERM"
        rationale = (
            f"A {contract_days}-day term contract at "
            f"${term_rate:,.2f}/t is cheaper than the risk-adjusted spot "
            f"programme and is cheaper outright in "
            f"{probability_term_cheaper * 100:.0f}% of simulated markets. "
            f"It also secures tonnage across {voyages_required} voyages."
        )

    return {
        "recommendation": recommendation,
        "rationale": rationale,
        "contract_days": contract_days,
        "voyages_required": voyages_required,
        "term_rate_per_tonne": round(term_rate, 2),
        "term_premium_pct": round((premium - 1) * 100, 2),
        "term_total_cost_usd": round(term_total_cost),
        "spot_expected_cost_usd": round(expected_spot_cost),
        "spot_best_case_usd": round(spot_p10_cost),
        "spot_worst_case_usd": round(spot_p90_cost),
        "spot_cost_std_usd": round(spot_std),
        "spot_cvar80_cost_usd": round(spot_cvar_cost),
        "spot_risk_adjusted_cost_usd": round(spot_risk_adjusted),
        "probability_term_cheaper": round(probability_term_cheaper, 4),
        "cost_certainty_gain_usd": round(spot_p90_cost - term_total_cost),
        "fixture_days": fixture_days,
    }


if __name__ == "__main__":
    # A gently falling forecast over 60 days.
    series = [30.0 - 0.03 * d for d in range(60)]

    for days, voyages in [(30, 2), (90, 5), (180, 9)]:
        result = compare_spot_vs_term(
            forecast_series=series,
            current_rate=30.0,
            cargo_quantity=300000,
            contract_days=days,
            voyages_required=voyages,
            volatility=2.4,
        )

        print("=" * 62)
        print(f"{days}-day horizon, {voyages} voyages, 300,000 t")
        print("=" * 62)
        print(f"  recommendation : {result['recommendation']}")
        print(
            f"  term rate      : ${result['term_rate_per_tonne']}/t "
            f"(+{result['term_premium_pct']}%)"
        )
        print(f"  term total     : ${result['term_total_cost_usd']:,}")
        print(f"  spot expected  : ${result['spot_expected_cost_usd']:,}")
        print(f"  spot worst(P90): ${result['spot_worst_case_usd']:,}")
        print(f"  P(term cheaper): {result['probability_term_cheaper']:.1%}")
        print()
