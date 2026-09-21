# ml/decision/charter_decision.py


def calculate_charter_decision(
    current_rate, forecast_best, forecast_expected, forecast_worst, waiting_cost
):
    """
    Decide whether to charter now or wait.

    Parameters
    ----------
    current_rate : float
        Current freight rate.

    forecast_best : float
        Lower forecast (Q10).

    forecast_expected : float
        Expected/median forecast (Q50).

    forecast_worst : float
        Upper forecast (Q90).

    waiting_cost : float
        Estimated cost of waiting.

    Returns
    -------
    dict
        Chartering decision and related metrics.
    """
    # -----------------------------------------
    # 1. Calculate expected saving
    # -----------------------------------------

    expected_saving = current_rate - forecast_expected

    # -----------------------------------------
    # 2. Calculate worst-case loss
    # -----------------------------------------

    worst_case_loss = forecast_worst - current_rate

    # -----------------------------------------
    # 3. Calculate best-case saving
    # -----------------------------------------

    best_case_saving = current_rate - forecast_best

    # -----------------------------------------
    # 4. Account for waiting cost
    # -----------------------------------------

    net_expected_saving = expected_saving - waiting_cost

    # -----------------------------------------
    # 5. Calculate forecast uncertainty
    # -----------------------------------------

    forecast_range = forecast_worst - forecast_best

    if forecast_expected != 0:
        uncertainty_percentage = (forecast_range / forecast_expected) * 100
    else:
        uncertainty_percentage = 0

    # -----------------------------------------
    # 6. Determine risk
    # -----------------------------------------

    if uncertainty_percentage < 10:
        risk = "LOW"

    elif uncertainty_percentage < 25:
        risk = "MEDIUM"

    else:
        risk = "HIGH"

    # -----------------------------------------
    # 7. Calculate confidence
    # -----------------------------------------

    confidence = max(0.0, min(1.0, 1 - (uncertainty_percentage / 100)))

    # -----------------------------------------
    # 8. Decision
    # -----------------------------------------

    if net_expected_saving > 0:
        decision = "WAIT"

        reason = (
            "Expected freight rate is lower than "
            "the current rate after accounting for "
            "waiting cost."
        )

    else:
        decision = "CHARTER NOW"

        reason = (
            "Waiting does not provide enough expected savings after accounting for waiting cost."
        )

    # -----------------------------------------
    # 9. Return result
    # -----------------------------------------

    return {
        "decision": decision,
        "current_rate": round(current_rate, 2),
        "forecast": {
            "best": round(forecast_best, 2),
            "expected": round(forecast_expected, 2),
            "worst": round(forecast_worst, 2),
        },
        "best_case_saving": round(best_case_saving, 2),
        "expected_saving": round(expected_saving, 2),
        "worst_case_loss": round(worst_case_loss, 2),
        "waiting_cost": round(waiting_cost, 2),
        "net_expected_saving": round(net_expected_saving, 2),
        "risk": risk,
        "confidence": round(confidence, 2),
        "reason": reason,
    }


# ---------------------------------------------
# TEST
# ---------------------------------------------

if __name__ == "__main__":
    print("========================================")
    print("CHARTER DECISION ENGINE")
    print("========================================")

    result = calculate_charter_decision(
        current_rate=32000,
        forecast_best=27000,
        forecast_expected=29000,
        forecast_worst=35000,
        waiting_cost=500,
    )

    print("\nDecision:")
    print(result["decision"])

    print("\nCurrent rate:")
    print(f"₹{result['current_rate']:,.2f}")

    print("\nForecast:")
    print(f"Best     : ₹{result['forecast']['best']:,.2f}")

    print(f"Expected : ₹{result['forecast']['expected']:,.2f}")

    print(f"Worst    : ₹{result['forecast']['worst']:,.2f}")

    print("\nExpected saving:")
    print(f"₹{result['expected_saving']:,.2f}")

    print("\nWaiting cost:")
    print(f"₹{result['waiting_cost']:,.2f}")

    print("\nNet expected saving:")
    print(f"₹{result['net_expected_saving']:,.2f}")

    print("\nRisk:")
    print(result["risk"])

    print("\nConfidence:")
    print(result["confidence"])

    print("\nReason:")
    print(result["reason"])
