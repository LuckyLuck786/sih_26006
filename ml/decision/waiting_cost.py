# ml/decision/waiting_cost.py

def calculate_waiting_cost(
    cargo_quantity,
    cargo_value_per_ton,
    annual_carrying_rate,
    storage_cost_per_day=0,
    operational_delay_cost_per_day=0
):
    """
    Calculate the estimated economic cost of waiting
    one additional day before chartering.

    Parameters
    ----------
    cargo_quantity : float
        Cargo quantity in tonnes.

    cargo_value_per_ton : float
        Value of cargo per tonne.

    annual_carrying_rate : float
        Annual carrying/inventory cost as a decimal.
        Example: 8% = 0.08

    storage_cost_per_day : float
        Additional storage cost per day.

    operational_delay_cost_per_day : float
        Other operational cost caused by delay per day.

    Returns
    -------
    dict
    """

    # -----------------------------------------
    # 1. Total cargo value
    # -----------------------------------------

    cargo_value = (
        cargo_quantity *
        cargo_value_per_ton
    )

    # -----------------------------------------
    # 2. Daily carrying cost
    # -----------------------------------------

    daily_carrying_cost = (
        cargo_value *
        annual_carrying_rate /
        365
    )

    # -----------------------------------------
    # 3. Total waiting cost
    # -----------------------------------------

    total_waiting_cost = (
        daily_carrying_cost
        + storage_cost_per_day
        + operational_delay_cost_per_day
    )

    return {
        "cargo_value": round(cargo_value, 2),

        "daily_carrying_cost": round(
            daily_carrying_cost,
            2
        ),

        "storage_cost_per_day": round(
            storage_cost_per_day,
            2
        ),

        "operational_delay_cost_per_day": round(
            operational_delay_cost_per_day,
            2
        ),

        "waiting_cost_per_day": round(
            total_waiting_cost,
            2
        )
    }


# ---------------------------------------------
# TEST
# ---------------------------------------------

if __name__ == "__main__":

    print("========================================")
    print("DYNAMIC WAITING COST CALCULATOR")
    print("========================================")

    result = calculate_waiting_cost(

        cargo_quantity=50000,

        cargo_value_per_ton=10000,

        annual_carrying_rate=0.08,

        storage_cost_per_day=100000,

        operational_delay_cost_per_day=50000
    )

    print(
        f"\nTotal cargo value:"
        f" ₹{result['cargo_value']:,.2f}"
    )

    print(
        f"\nDaily carrying cost:"
        f" ₹{result['daily_carrying_cost']:,.2f}"
    )

    print(
        f"\nStorage cost/day:"
        f" ₹{result['storage_cost_per_day']:,.2f}"
    )

    print(
        f"\nOperational delay cost/day:"
        f" ₹{result['operational_delay_cost_per_day']:,.2f}"
    )

    print(
        "\n----------------------------------------"
    )

    print(
        f"\nTOTAL WAITING COST/DAY:"
        f" ₹{result['waiting_cost_per_day']:,.2f}"
    )