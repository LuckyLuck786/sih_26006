"""
Early-warning engine for PS 26006 requirement (d):

    "Provide early warnings for potential market volatility, port
     congestion, or other disruptions that could impact chartering
     decisions."

The first prototype reduced risk to a single LOW/MEDIUM/HIGH label
derived from the width of the forecast band. The `congestion` column
that the dataset already carried was never read by any decision.

This module produces discrete, explained alerts across four families:

    market volatility   how wide the forecast band is, and whether
                        recent realised volatility is accelerating
    port congestion     berth pressure at load and discharge
    supply tightness    how much open tonnage is on the lane
    decision risk       how close the charter/wait call is to flipping
"""


SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}


def _alert(category, severity, title, message, metric=None):
    return {
        "category": category,
        "severity": severity,
        "title": title,
        "message": message,
        "metric": metric,
    }


def assess_market_volatility(forecast_best, forecast_expected, forecast_worst,
                             recent_volatility=None):
    """Width of the forecast band, relative to the expected level."""

    alerts = []

    if forecast_expected <= 0:
        return alerts

    band = forecast_worst - forecast_best
    band_pct = band / forecast_expected * 100

    if band_pct >= 30:
        alerts.append(_alert(
            "volatility", "high",
            "Wide forecast band",
            f"The Q10-Q90 band spans {band_pct:.0f}% of the expected rate "
            f"(${forecast_best:,.2f}-${forecast_worst:,.2f}/t). Rate risk on "
            f"this lane is elevated; favour shorter commitments or fix term.",
            round(band_pct, 1),
        ))
    elif band_pct >= 18:
        alerts.append(_alert(
            "volatility", "medium",
            "Moderate rate uncertainty",
            f"Forecast band is {band_pct:.0f}% of the expected rate. Build "
            f"tolerance into the laycan rather than fixing on a point estimate.",
            round(band_pct, 1),
        ))

    if recent_volatility is not None and forecast_expected:
        realised_pct = recent_volatility / forecast_expected * 100
        if realised_pct >= 6:
            alerts.append(_alert(
                "volatility", "high",
                "Realised volatility accelerating",
                f"Rates have moved {realised_pct:.1f}% (1 sigma) over the "
                f"trailing window. Short-lived entry windows are likely; "
                f"monitor daily rather than weekly.",
                round(realised_pct, 1),
            ))

    return alerts


def assess_congestion(load_port, discharge_port,
                      load_congestion, discharge_congestion):
    """Berth pressure at either end of the voyage."""

    alerts = []

    for port, congestion, role in (
        (discharge_port, discharge_congestion, "discharge"),
        (load_port, load_congestion, "load"),
    ):

        if congestion is None:
            continue

        name = port["port"]
        berths = port.get("berths", 2)

        if congestion >= 0.75:
            alerts.append(_alert(
                "congestion", "critical",
                f"Severe congestion at {name}",
                f"{name} is running at {congestion * 100:.0f}% berth "
                f"utilisation across {berths} berths. Expect multi-day "
                f"waiting and demurrage exposure on the {role} leg. "
                f"Consider an alternative {role} port.",
                round(congestion, 2),
            ))
        elif congestion >= 0.55:
            alerts.append(_alert(
                "congestion", "high",
                f"Building congestion at {name}",
                f"{name} is at {congestion * 100:.0f}% berth utilisation. "
                f"Queues are forming; push the laycan later or widen the "
                f"laytime allowance.",
                round(congestion, 2),
            ))
        elif congestion >= 0.40:
            alerts.append(_alert(
                "congestion", "medium",
                f"Watch congestion at {name}",
                f"{name} is at {congestion * 100:.0f}% utilisation — "
                f"manageable now, but worth monitoring before fixing.",
                round(congestion, 2),
            ))

    return alerts


def assess_supply(vessel_supply, available_vessels=None):
    """How much open tonnage is competing for the cargo."""

    alerts = []

    if vessel_supply is not None:

        if vessel_supply <= 10:
            alerts.append(_alert(
                "supply", "high",
                "Tight tonnage supply",
                f"Only {vessel_supply} vessels are open on this lane. "
                f"Owners hold pricing power; waiting is more likely to cost "
                f"than save.",
                vessel_supply,
            ))
        elif vessel_supply >= 32:
            alerts.append(_alert(
                "supply", "info",
                "Ample tonnage available",
                f"{vessel_supply} vessels are open on this lane. Competition "
                f"favours the charterer — there is room to negotiate.",
                vessel_supply,
            ))

    if available_vessels is not None and available_vessels == 0:
        alerts.append(_alert(
            "supply", "critical",
            "No open vessels matched",
            "No available vessel in the tracked fleet matches this lane and "
            "class. Widen the vessel class or check an alternative load port.",
            0,
        ))

    return alerts


def assess_decision_risk(net_expected_saving, waiting_cost,
                         probability_waiting_wins=None):
    """How fragile the charter/wait recommendation is."""

    alerts = []

    if waiting_cost and abs(net_expected_saving) < waiting_cost * 1.5:
        alerts.append(_alert(
            "decision", "medium",
            "Marginal charter/wait call",
            f"Net expected saving (${net_expected_saving:,.2f}/t) is within "
            f"1.5x the daily waiting cost. The recommendation could flip on "
            f"a small rate move — treat it as a close call, not a signal.",
            round(net_expected_saving, 2),
        ))

    if probability_waiting_wins is not None:
        if 0.42 <= probability_waiting_wins <= 0.58:
            alerts.append(_alert(
                "decision", "medium",
                "Low conviction on timing",
                f"Waiting beats fixing in only "
                f"{probability_waiting_wins * 100:.0f}% of simulated markets "
                f"— close to a coin flip. Prefer the option that preserves "
                f"flexibility.",
                round(probability_waiting_wins, 3),
            ))

    return alerts


def build_risk_report(
    forecast_best,
    forecast_expected,
    forecast_worst,
    load_port,
    discharge_port,
    load_congestion=None,
    discharge_congestion=None,
    vessel_supply=None,
    available_vessels=None,
    net_expected_saving=0.0,
    waiting_cost=0.0,
    probability_waiting_wins=None,
    recent_volatility=None,
):
    """Collect every alert family into one ranked report."""

    alerts = []

    alerts += assess_market_volatility(
        forecast_best, forecast_expected, forecast_worst, recent_volatility
    )

    alerts += assess_congestion(
        load_port, discharge_port, load_congestion, discharge_congestion
    )

    alerts += assess_supply(vessel_supply, available_vessels)

    alerts += assess_decision_risk(
        net_expected_saving, waiting_cost, probability_waiting_wins
    )

    alerts.sort(key=lambda a: SEVERITY_ORDER.get(a["severity"], 9))

    if not alerts:
        alerts.append(_alert(
            "clear", "info",
            "No active warnings",
            "Volatility, congestion and tonnage supply are all within normal "
            "ranges for this lane.",
        ))

    counts = {}
    for alert in alerts:
        counts[alert["severity"]] = counts.get(alert["severity"], 0) + 1

    if counts.get("critical"):
        overall = "CRITICAL"
    elif counts.get("high"):
        overall = "HIGH"
    elif counts.get("medium"):
        overall = "MEDIUM"
    else:
        overall = "LOW"

    return {
        "overall_risk": overall,
        "alert_count": len([a for a in alerts if a["category"] != "clear"]),
        "counts_by_severity": counts,
        "alerts": alerts,
    }
