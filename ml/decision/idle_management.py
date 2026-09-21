"""
Idle-scenario management for PS 26006 requirement (c).

The problem statement asks for strategies that minimise vessel idle time
by forecasting periods of low demand and suggesting alternative
employment or repositioning to reduce deadheading.

Idle time on a dry-bulk voyage comes from three places:

    waiting for a berth          driven by congestion at the discharge port
    time alongside               driven by the port's cargo handling rate
    ballast legs                 the vessel steams empty to its next load

The port handling rates in ports.json were present in the first
prototype but never used by any calculation. They are the input to all
of this.
"""

import math


# A berth queue grows non-linearly with congestion: at 80% utilisation
# waiting time rises much faster than at 40%. This scales the expected
# queue in days.
CONGESTION_QUEUE_DAYS = 9.0

# Demurrage is what the charterer pays the owner for time beyond the
# agreed laytime. US$/day, indicative for the classes modelled here.
DEMURRAGE_USD_PER_DAY = {
    "Handysize": 8000,
    "Supramax": 11000,
    "Panamax": 14000,
    "Capesize": 22000,
}


def estimate_berth_wait_days(congestion, berths):
    """
    Expected wait for a berth, in days.

    Queueing grows sharply as utilisation approaches one, so a convex
    function of congestion is used rather than a linear one. More berths
    absorb more of the queue.
    """

    congestion = min(max(congestion, 0.0), 0.98)

    # Convex in congestion, softened by berth count.
    queue = CONGESTION_QUEUE_DAYS * (congestion ** 2) / max(berths, 1) * 2.0

    return round(queue, 2)


def analyse_idle(
    vessel_type,
    tonnes_per_voyage,
    load_port,
    discharge_port,
    sea_days,
    load_congestion,
    discharge_congestion,
    agreed_laytime_days=None,
):
    """
    Break a round trip into productive and idle time and cost the idle
    portion.
    """

    load_days = tonnes_per_voyage / load_port["cargo_handling_rate"]
    discharge_days = tonnes_per_voyage / discharge_port["cargo_handling_rate"]

    load_wait = estimate_berth_wait_days(
        load_congestion, load_port.get("berths", 2)
    )

    discharge_wait = estimate_berth_wait_days(
        discharge_congestion, discharge_port.get("berths", 2)
    )

    # Laden out plus ballast back.
    ballast_days = sea_days

    total_days = (
        sea_days
        + ballast_days
        + load_days
        + discharge_days
        + load_wait
        + discharge_wait
    )

    # Only the laden leg and cargo operations earn. Waiting and the
    # ballast leg do not.
    productive_days = sea_days + load_days + discharge_days

    idle_days = load_wait + discharge_wait + ballast_days

    idle_share = idle_days / total_days if total_days else 0.0

    # ------------------------------------------------------
    # Demurrage exposure
    # ------------------------------------------------------

    if agreed_laytime_days is None:
        # Customary laytime is the time the cargo *should* take.
        agreed_laytime_days = round(load_days + discharge_days, 2)

    used_laytime = load_days + discharge_days + load_wait + discharge_wait

    demurrage_days = max(0.0, used_laytime - agreed_laytime_days)

    daily_demurrage = DEMURRAGE_USD_PER_DAY.get(vessel_type, 12000)

    demurrage_cost = demurrage_days * daily_demurrage

    # ------------------------------------------------------
    # Mitigations
    # ------------------------------------------------------

    recommendations = []

    if discharge_wait > 2.0:
        recommendations.append({
            "type": "berth_congestion",
            "severity": "high" if discharge_wait > 4 else "medium",
            "message": (
                f"{discharge_port['port']} is holding an estimated "
                f"{discharge_wait:.1f} day berth queue. Consider a "
                f"laycan shifted later, or discharge at a less "
                f"congested East Coast port."
            ),
        })

    if ballast_days > sea_days * 0.9:
        recommendations.append({
            "type": "deadheading",
            "severity": "medium",
            "message": (
                f"The ballast leg is {ballast_days:.1f} days of unpaid "
                f"steaming. Seek a backhaul cargo out of "
                f"{discharge_port['port']} to cut deadheading."
            ),
        })

    if idle_share > 0.45:
        recommendations.append({
            "type": "utilisation",
            "severity": "high",
            "message": (
                f"{idle_share * 100:.0f}% of the round trip is "
                f"non-earning. A time-charter covering several voyages "
                f"would spread this idle time across more cargo."
            ),
        })

    if demurrage_days > 0.5:
        recommendations.append({
            "type": "demurrage",
            "severity": "high" if demurrage_days > 2 else "medium",
            "message": (
                f"Projected demurrage of {demurrage_days:.1f} days "
                f"(~${demurrage_cost:,.0f}). Negotiate laytime of at "
                f"least {used_laytime:.1f} days."
            ),
        })

    if not recommendations:
        recommendations.append({
            "type": "clear",
            "severity": "low",
            "message": (
                "No material idle-time exposure on this lane at current "
                "congestion levels."
            ),
        })

    return {
        "sea_days_laden": round(sea_days, 2),
        "ballast_days": round(ballast_days, 2),
        "load_days": round(load_days, 2),
        "discharge_days": round(discharge_days, 2),
        "load_berth_wait_days": load_wait,
        "discharge_berth_wait_days": discharge_wait,
        "total_round_trip_days": round(total_days, 2),
        "productive_days": round(productive_days, 2),
        "idle_days": round(idle_days, 2),
        "idle_share": round(idle_share, 3),
        "agreed_laytime_days": round(agreed_laytime_days, 2),
        "projected_laytime_days": round(used_laytime, 2),
        "demurrage_days": round(demurrage_days, 2),
        "demurrage_cost_usd": round(demurrage_cost),
        "recommendations": recommendations,
    }


if __name__ == "__main__":

    import json
    import os

    root = os.path.join(os.path.dirname(__file__), "..", "..")

    with open(os.path.join(root, "data", "ports.json")) as handle:
        ports = {p["port"]: p for p in json.load(handle)}

    for discharge, congestion in [("Gangavaram", 0.25), ("Haldia", 0.72)]:

        result = analyse_idle(
            vessel_type="Panamax",
            tonnes_per_voyage=70000,
            load_port=ports["Newcastle"],
            discharge_port=ports[discharge],
            sea_days=17.9,
            load_congestion=0.3,
            discharge_congestion=congestion,
        )

        print("=" * 62)
        print(f"Newcastle -> {discharge} (congestion {congestion})")
        print("=" * 62)
        print(f"  round trip     : {result['total_round_trip_days']} days")
        print(f"  idle           : {result['idle_days']} days "
              f"({result['idle_share'] * 100:.0f}%)")
        print(f"  berth queue    : {result['discharge_berth_wait_days']} days")
        print(f"  demurrage      : ${result['demurrage_cost_usd']:,}")

        for rec in result["recommendations"]:
            print(f"  [{rec['severity']:6}] {rec['message'][:70]}")

        print()
