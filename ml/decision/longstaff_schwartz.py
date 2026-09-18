# ml/decision/longstaff_schwartz.py

import numpy as np


class LongstaffSchwartz:

    def __init__(
        self,
        simulations=5000,
        time_steps=7,
        random_seed=42
    ):
        """
        Longstaff-Schwartz optimal stopping model.

        simulations:
            Number of simulated freight-rate paths.

        time_steps:
            Number of future decision periods.

        random_seed:
            Makes testing reproducible.
        """

        self.simulations = simulations
        self.time_steps = time_steps
        self.random_seed = random_seed

    def simulate_paths(
        self,
        current_rate,
        forecast_expected,
        forecast_best,
        forecast_worst
    ):
        """
        Generate future freight-rate paths.
        """

        np.random.seed(self.random_seed)

        # -----------------------------------------
        # Estimate volatility from forecast range
        # -----------------------------------------

        volatility = (
            forecast_worst -
            forecast_best
        ) / 4

        volatility = max(
            volatility,
            1
        )

        # -----------------------------------------
        # Create matrix
        #
        # rows    = simulations
        # columns = future days
        # -----------------------------------------

        paths = np.zeros(
            (
                self.simulations,
                self.time_steps + 1
            )
        )

        # Today's rate
        paths[:, 0] = current_rate

        # -----------------------------------------
        # Generate paths
        # -----------------------------------------

        for t in range(
            1,
            self.time_steps + 1
        ):

            random_shock = np.random.normal(
                0,
                volatility,
                self.simulations
            )

            paths[:, t] = (
                paths[:, t - 1]
                + random_shock
            )

            # Prevent negative rates
            paths[:, t] = np.maximum(
                paths[:, t],
                0
            )

        return paths

    def calculate_optimal_stopping(
        self,
        paths,
        waiting_cost
    ):
        """
        Estimate the optimal stopping time.

        At every future period we compare:

            charter now
        vs.
            continue waiting
        """

        n_paths = paths.shape[0]
        n_steps = paths.shape[1]

        # -----------------------------------------
        # Immediate charter value
        #
        # Lower freight rate = better
        # -----------------------------------------

        values = (
            paths[:, -1]
            + waiting_cost * self.time_steps
        )

        stopping_time = np.full(
            n_paths,
            self.time_steps
        )

        # -----------------------------------------
        # Work backwards
        # -----------------------------------------

        for t in range(
            n_steps - 2,
            0,
            -1
        ):

            current_rates = paths[:, t]

            # Cost of waiting until this period
            remaining_wait_cost = (
                waiting_cost *
                (self.time_steps - t)
            )

            # Total cost if we charter now
            immediate_cost = (
                current_rates
                + remaining_wait_cost
            )

            # -------------------------------------
            # Regression basis
            # -------------------------------------

            X = np.column_stack([
                np.ones(n_paths),
                current_rates,
                current_rates ** 2
            ])

            # -------------------------------------
            # Estimate continuation value
            # -------------------------------------

            coefficients = np.linalg.lstsq(
                X,
                values,
                rcond=None
            )[0]

            continuation_value = (
                X @ coefficients
            )

            # -------------------------------------
            # Decide whether to stop
            # -------------------------------------

            exercise = (
                immediate_cost
                < continuation_value
            )

            values[exercise] = (
                immediate_cost[exercise]
            )

            stopping_time[exercise] = t

        return (
            stopping_time,
            values
        )

    def run(
        self,
        current_rate,
        forecast_expected,
        forecast_best,
        forecast_worst,
        waiting_cost
    ):
        """
        Run complete Longstaff-Schwartz model.
        """

        paths = self.simulate_paths(

            current_rate=current_rate,

            forecast_expected=forecast_expected,

            forecast_best=forecast_best,

            forecast_worst=forecast_worst
        )

        stopping_time, values = (
            self.calculate_optimal_stopping(
                paths,
                waiting_cost
            )
        )

        # -----------------------------------------
        # Determine recommended period
        # -----------------------------------------

        average_stopping_time = np.mean(
            stopping_time
        )

        # -----------------------------------------
        # Count immediate charter decisions
        # -----------------------------------------

        charter_now_probability = np.mean(
            stopping_time == 0
        )

        # -----------------------------------------
        # Calculate expected optimal cost
        # -----------------------------------------

        expected_optimal_cost = np.mean(
            values
        )

        return {

            "optimal_waiting_days": round(
                float(average_stopping_time),
                2
            ),

            "charter_now_probability": round(
                float(charter_now_probability),
                4
            ),

            "expected_optimal_cost": round(
                float(expected_optimal_cost),
                2
            ),

            "simulations": self.simulations,

            "time_steps": self.time_steps
        }


# =====================================================
# TEST
# =====================================================

if __name__ == "__main__":

    print("========================================")
    print("LONGSTAFF-SCHWARTZ DECISION ENGINE")
    print("========================================")

    model = LongstaffSchwartz(

        simulations=5000,

        time_steps=7,

        random_seed=42
    )

    result = model.run(

        current_rate=32000,

        forecast_expected=29000,

        forecast_best=27000,

        forecast_worst=35000,

        waiting_cost=500
    )

    print("\nSimulations:")
    print(
        result["simulations"]
    )

    print("\nDecision horizon:")
    print(
        result["time_steps"],
        "days"
    )

    print("\nOptimal waiting time:")
    print(
        result["optimal_waiting_days"],
        "days"
    )

    print("\nCharter-now probability:")
    print(
        f"{result['charter_now_probability'] * 100:.2f}%"
    )

    print("\nExpected optimal cost:")
    print(
        f"₹{result['expected_optimal_cost']:,.2f}"
    )