from ml.decision.waiting_cost import calculate_waiting_cost
from ml.decision.charter_decision import calculate_charter_decision
from ml.decision.monte_carlo import monte_carlo_simulation


def run_decision_pipeline(
    current_rate,
    forecast_best,
    forecast_expected,
    forecast_worst,
    cargo_quantity,
    cargo_value_per_ton,
    annual_carrying_rate,
    storage_cost_per_day=0,
    operational_delay_cost_per_day=0
):

    # --------------------------------
    # 1. Calculate waiting cost
    # --------------------------------

    waiting_cost_data = calculate_waiting_cost(
        cargo_quantity=cargo_quantity,
        cargo_value_per_ton=cargo_value_per_ton,
        annual_carrying_rate=annual_carrying_rate,
        storage_cost_per_day=storage_cost_per_day,
        operational_delay_cost_per_day=operational_delay_cost_per_day
    )

    waiting_cost = waiting_cost_data["waiting_cost_per_day"]

    # --------------------------------
    # 2. Basic charter decision
    # --------------------------------

    decision_result = calculate_charter_decision(
        current_rate=current_rate,
        forecast_best=forecast_best,
        forecast_expected=forecast_expected,
        forecast_worst=forecast_worst,
        waiting_cost=waiting_cost
    )

    # --------------------------------
    # 3. Monte Carlo simulation
    # --------------------------------

    monte_carlo_result = monte_carlo_simulation(
        current_rate=current_rate,
        forecast_best=forecast_best,
        forecast_expected=forecast_expected,
        forecast_worst=forecast_worst,
        waiting_cost=waiting_cost
    )

    # --------------------------------
    # 4. Combine results
    # --------------------------------

    return {
        "waiting_cost": waiting_cost_data,
        "charter_decision": decision_result,
        "monte_carlo": monte_carlo_result
    }


if __name__ == "__main__":

    result = run_decision_pipeline(
        current_rate=5000,
        forecast_best=4700,
        forecast_expected=4900,
        forecast_worst=5300,

        cargo_quantity=50000,
        cargo_value_per_ton=10000,
        annual_carrying_rate=0.08,

        storage_cost_per_day=100000,
        operational_delay_cost_per_day=50000
    )

    print("\n========================================")
    print("DECISION PIPELINE RESULT")
    print("========================================")

    print("\nWaiting Cost:")
    print(result["waiting_cost"])

    print("\nCharter Decision:")
    print(result["charter_decision"])

    print("\nMonte Carlo:")
    print(result["monte_carlo"])