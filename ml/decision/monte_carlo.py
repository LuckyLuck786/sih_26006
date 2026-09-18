# ml/decision/monte_carlo.py

import numpy as np


def monte_carlo_simulation(
    current_rate,
    forecast_best,
    forecast_expected,
    forecast_worst,
    waiting_cost=500,
    simulations=10000
):
    """
    Simulate possible future freight rates.

    The Q10/Q50/Q90 forecast is used to construct
    an approximate future-rate distribution.
    """

    # -----------------------------------------
    # 1. Estimate uncertainty
    # -----------------------------------------

    lower_spread = (
        forecast_expected - forecast_best
    )

    upper_spread = (
        forecast_worst - forecast_expected
    )

    # Avoid zero uncertainty
    lower_spread = max(lower_spread, 1)
    upper_spread = max(upper_spread, 1)

    # -----------------------------------------
    # 2. Generate random samples
    # -----------------------------------------

    random_values = np.random.normal(
        loc=0,
        scale=1,
        size=simulations
    )

    # -----------------------------------------
    # 3. Create future rates
    # -----------------------------------------

    future_rates = np.where(

        random_values < 0,

        forecast_expected
        + random_values * lower_spread,

        forecast_expected
        + random_values * upper_spread
    )

    # -----------------------------------------
    # 4. Prevent negative freight rates
    # -----------------------------------------

    future_rates = np.maximum(
        future_rates,
        0
    )

    # -----------------------------------------
    # 5. Calculate savings
    # -----------------------------------------

    savings = (
        current_rate
        - future_rates
        - waiting_cost
    )

    # -----------------------------------------
    # 6. Expected saving
    # -----------------------------------------

    expected_saving = np.mean(savings)

    # -----------------------------------------
    # 7. Probability of saving money
    # -----------------------------------------

    probability_of_saving = np.mean(
        savings > 0
    )

    # -----------------------------------------
    # 8. Probability rate increases
    # -----------------------------------------

    probability_rate_increase = np.mean(
        future_rates > current_rate
    )

    # -----------------------------------------
    # 9. Probability rate decreases
    # -----------------------------------------

    probability_rate_decrease = np.mean(
        future_rates < current_rate
    )

    # -----------------------------------------
    # 10. Percentiles
    # -----------------------------------------

    simulated_q10 = np.percentile(
        future_rates,
        10
    )

    simulated_q50 = np.percentile(
        future_rates,
        50
    )

    simulated_q90 = np.percentile(
        future_rates,
        90
    )

    # -----------------------------------------
    # 11. Worst simulated outcome
    # -----------------------------------------

    worst_simulated_rate = np.max(
        future_rates
    )

    # -----------------------------------------
    # 12. Best simulated outcome
    # -----------------------------------------

    best_simulated_rate = np.min(
        future_rates
    )

    # -----------------------------------------
    # 13. Return results
    # -----------------------------------------

    return {

        "simulations": simulations,

        "expected_future_rate": round(
            float(np.mean(future_rates)),
            2
        ),

        "simulated_q10": round(
            float(simulated_q10),
            2
        ),

        "simulated_q50": round(
            float(simulated_q50),
            2
        ),

        "simulated_q90": round(
            float(simulated_q90),
            2
        ),

        "expected_saving": round(
            float(expected_saving),
            2
        ),

        "probability_of_saving": round(
            float(probability_of_saving),
            4
        ),

        "probability_rate_increase": round(
            float(probability_rate_increase),
            4
        ),

        "probability_rate_decrease": round(
            float(probability_rate_decrease),
            4
        ),

        "best_simulated_rate": round(
            float(best_simulated_rate),
            2
        ),

        "worst_simulated_rate": round(
            float(worst_simulated_rate),
            2
        )
    }


# ---------------------------------------------
# TEST
# ---------------------------------------------

if __name__ == "__main__":

    print("========================================")
    print("MONTE CARLO FREIGHT SIMULATION")
    print("========================================")

    result = monte_carlo_simulation(

        current_rate=32000,

        forecast_best=27000,

        forecast_expected=29000,

        forecast_worst=35000,

        waiting_cost=500,

        simulations=10000
    )

    print(
        f"\nSimulations: "
        f"{result['simulations']:,}"
    )

    print(
        f"\nExpected future rate: "
        f"₹{result['expected_future_rate']:,.2f}"
    )

    print(
        f"\nSimulated Q10: "
        f"₹{result['simulated_q10']:,.2f}"
    )

    print(
        f"Simulated Q50: "
        f"₹{result['simulated_q50']:,.2f}"
    )

    print(
        f"Simulated Q90: "
        f"₹{result['simulated_q90']:,.2f}"
    )

    print(
        f"\nExpected saving: "
        f"₹{result['expected_saving']:,.2f}"
    )

    print(
        f"\nProbability of saving: "
        f"{result['probability_of_saving'] * 100:.2f}%"
    )

    print(
        f"\nProbability rate increases: "
        f"{result['probability_rate_increase'] * 100:.2f}%"
    )

    print(
        f"\nProbability rate decreases: "
        f"{result['probability_rate_decrease'] * 100:.2f}%"
    )