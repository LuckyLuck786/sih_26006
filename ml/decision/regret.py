def calculate_regret(current_rate, actual_future_rate, decision, cargo_quantity):

    charter_now_cost = current_rate
    wait_cost = actual_future_rate

    if decision == "WAIT":
        regret_per_ton = max(0, wait_cost - charter_now_cost)

    else:
        regret_per_ton = max(0, charter_now_cost - wait_cost)

    total_regret = regret_per_ton * cargo_quantity

    return {
        "decision": decision,
        "current_rate": round(current_rate, 2),
        "actual_future_rate": round(actual_future_rate, 2),
        "regret_per_ton": round(regret_per_ton, 2),
        "total_regret": round(total_regret, 2),
    }


if __name__ == "__main__":
    result = calculate_regret(
        current_rate=5000,
        actual_future_rate=5300,
        decision="WAIT",
        cargo_quantity=50000,
    )

    print(result)
