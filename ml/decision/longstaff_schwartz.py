"""
Longstaff-Schwartz optimal stopping for PS 26006 requirement (a):
"identify ideal windows to secure short-term or mid-term charter
contracts".

Chartering is an optimal-stopping problem. Every day the charterer may
fix at the rate on the screen, or wait one more day and accept whatever
the market offers then, having paid another day of carrying cost. The
Longstaff-Schwartz method answers that by simulating many future rate
paths and, working backwards, regressing the value of continuing on the
current state to decide when stopping is optimal.

Three corrections were made against the first prototype:

1.  The waiting-cost term was inverted. It charged
    ``waiting_cost * (time_steps - t)``, so waiting longer cost *less*.
    Cost of fixing on day t is now ``rate_t + waiting_cost * t``.

2.  The backward induction ran ``range(n_steps - 2, 0, -1)`` and never
    reached t = 0, so ``stopping_time`` could never be 0 and the
    reported charter-now probability was always exactly 0.0. Day zero is
    now evaluated explicitly, which it has to be: the rate today is
    known, so it is a decision, not a distribution.

3.  ``forecast_expected`` was accepted and never used. Paths now revert
    toward the forecast instead of drifting on a pure random walk.
"""

import numpy as np


class LongstaffSchwartz:

    def __init__(
        self,
        simulations=5000,
        time_steps=14,
        random_seed=26006,
    ):
        """
        simulations:
            Number of simulated freight-rate paths.

        time_steps:
            Decision horizon in days. 14 matches the forecast series the
            dashboard plots.

        random_seed:
            Fixed so a demo produces the same answer twice.
        """

        self.simulations = simulations
        self.time_steps = time_steps
        self.random_seed = random_seed

    # ----------------------------------------------------------
    # Path simulation
    # ----------------------------------------------------------

    def simulate_paths(
        self,
        current_rate,
        forecast_expected,
        forecast_best,
        forecast_worst,
    ):
        """
        Generate future rate paths that revert toward the forecast.

        The Q10-Q90 band from the quantile model is treated as roughly a
        2-sigma spread at the forecast horizon, which sets the daily
        volatility.
        """

        rng = np.random.default_rng(self.random_seed)

        # Q10..Q90 spans about 2.56 sigma for a normal distribution.
        horizon_sigma = max((forecast_worst - forecast_best) / 2.56, 1e-6)

        # Spread grows with the square root of time, so back out the
        # per-day volatility from the horizon volatility.
        daily_sigma = horizon_sigma / np.sqrt(max(self.time_steps, 1))

        # Speed of reversion toward the forecast level.
        reversion = 0.15

        paths = np.zeros((self.simulations, self.time_steps + 1))
        paths[:, 0] = current_rate

        for t in range(1, self.time_steps + 1):

            previous = paths[:, t - 1]

            drift = reversion * (forecast_expected - previous)

            shock = rng.normal(0.0, daily_sigma, self.simulations)

            paths[:, t] = np.maximum(previous + drift + shock, 0.0)

        return paths

    # ----------------------------------------------------------
    # Backward induction
    # ----------------------------------------------------------

    def calculate_optimal_stopping(self, paths, waiting_cost):
        """
        Work backwards to find, for each path, the cheapest day to fix.

        Cost of fixing on day t is the rate on that day plus the carrying
        cost of having waited t days. Lower is better throughout.
        """

        n_paths, n_steps = paths.shape

        horizon = n_steps - 1

        # Start by assuming every path waits to the end of the horizon.
        values = paths[:, horizon] + waiting_cost * horizon

        stopping_time = np.full(n_paths, horizon, dtype=int)

        for t in range(n_steps - 2, 0, -1):

            rates_now = paths[:, t]

            immediate_cost = rates_now + waiting_cost * t

            # Regress the realised continuation cost on the current rate
            # to estimate what waiting is worth from this state.
            basis = np.column_stack([
                np.ones(n_paths),
                rates_now,
                rates_now ** 2,
            ])

            coefficients, *_ = np.linalg.lstsq(basis, values, rcond=None)

            continuation_value = basis @ coefficients

            exercise = immediate_cost < continuation_value

            values[exercise] = immediate_cost[exercise]
            stopping_time[exercise] = t

        return stopping_time, values

    # ----------------------------------------------------------
    # Public entry point
    # ----------------------------------------------------------

    def run(
        self,
        current_rate,
        forecast_expected,
        forecast_best,
        forecast_worst,
        waiting_cost,
    ):
        paths = self.simulate_paths(
            current_rate=current_rate,
            forecast_expected=forecast_expected,
            forecast_best=forecast_best,
            forecast_worst=forecast_worst,
        )

        stopping_time, values = self.calculate_optimal_stopping(
            paths, waiting_cost
        )

        # ------------------------------------------------------
        # Day zero is a decision, not a distribution: today's rate
        # is known. Compare fixing now against the expected cost of
        # following the optimal waiting policy.
        # ------------------------------------------------------

        cost_if_fixed_today = float(current_rate)

        expected_cost_if_waiting = float(np.mean(values))

        charter_now = cost_if_fixed_today <= expected_cost_if_waiting

        # Share of simulated futures in which waiting actually paid off.
        probability_waiting_wins = float(
            np.mean(values < cost_if_fixed_today)
        )

        # Most frequently chosen day to fix, among paths that waited.
        day_counts = np.bincount(stopping_time, minlength=self.time_steps + 1)
        modal_day = int(np.argmax(day_counts))

        expected_saving = cost_if_fixed_today - expected_cost_if_waiting

        if charter_now:
            recommended_window = "Fix today"
        elif modal_day <= 3:
            recommended_window = f"Fix within {max(modal_day, 1)}-3 days"
        elif modal_day <= 7:
            recommended_window = f"Fix around day {modal_day} (this week)"
        else:
            recommended_window = f"Hold to around day {modal_day}"

        return {
            "decision": "CHARTER NOW" if charter_now else "WAIT",
            "recommended_window": recommended_window,
            "optimal_waiting_days": round(float(np.mean(stopping_time)), 2),
            "modal_stopping_day": modal_day,
            "charter_now_is_optimal": bool(charter_now),
            "probability_waiting_wins": round(probability_waiting_wins, 4),
            "cost_if_fixed_today": round(cost_if_fixed_today, 2),
            "expected_cost_if_waiting": round(expected_cost_if_waiting, 2),
            "expected_saving_per_tonne": round(float(expected_saving), 2),
            "stopping_day_distribution": day_counts.tolist(),
            "simulations": self.simulations,
            "time_steps": self.time_steps,
        }


if __name__ == "__main__":

    model = LongstaffSchwartz()

    print("=" * 62)
    print("LONGSTAFF-SCHWARTZ OPTIMAL STOPPING")
    print("=" * 62)

    scenarios = [
        ("Market expected to fall", 32.0, 28.0, 26.0, 33.0),
        ("Market expected to rise", 24.0, 29.0, 26.0, 33.0),
        ("Flat market", 29.0, 29.0, 26.0, 33.0),
    ]

    for label, current, expected, best, worst in scenarios:

        result = model.run(
            current_rate=current,
            forecast_expected=expected,
            forecast_best=best,
            forecast_worst=worst,
            waiting_cost=0.08,
        )

        print(f"\n{label}  (now ${current}/t, forecast ${expected}/t)")
        print(f"  decision            : {result['decision']}")
        print(f"  window              : {result['recommended_window']}")
        print(f"  modal stopping day  : {result['modal_stopping_day']}")
        print(f"  P(waiting wins)     : {result['probability_waiting_wins']:.1%}")
        print(f"  expected saving     : ${result['expected_saving_per_tonne']}/t")
