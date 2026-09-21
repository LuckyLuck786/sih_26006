"""
End-to-end charter decision pipeline.

The first version of this file wired together three modules: waiting
cost, a charter/wait comparison and a Monte Carlo simulation. The
optimal-stopping model and the regret calculator sat in the repository
unused, and nothing addressed vessel-class choice, idle time, contract
structure or risk warnings.

This pipeline runs every stage and returns one response object covering
all four lettered requirements of PS 26006 plus its stated objective:

    (a) optimal market entry timing   -> Longstaff-Schwartz
    (b) vessel type optimisation      -> vessel_optimizer
    (c) idle scenario management      -> idle_management
    (d) risk mitigation               -> risk.alerts
    objective: spot -> term           -> contract_strategy

A note on units. Freight rates here are US$ per tonne, so every monetary
quantity that is compared against a rate must also be per tonne. The
waiting cost helper returns an absolute daily figure for the whole
parcel, so it is divided by the cargo quantity before it meets a rate.
"""

import json
import math
import os

from ml.decision.charter_decision import calculate_charter_decision
from ml.decision.contract_strategy import compare_spot_vs_term
from ml.decision.idle_management import analyse_idle
from ml.decision.longstaff_schwartz import LongstaffSchwartz
from ml.decision.monte_carlo import monte_carlo_simulation
from ml.decision.vessel_optimizer import rank_vessel_classes
from ml.decision.waiting_cost import calculate_waiting_cost
from ml.forecasting import forecast_service
from ml.risk.alerts import build_risk_report


def _repo_root():
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def _load_json(name):
    with open(os.path.join(_repo_root(), "data", name)) as handle:
        return json.load(handle)


_REFERENCE = {}


def reference_data():
    """Ports, classes and routes, loaded once."""

    if not _REFERENCE:
        ports = _load_json("ports.json")
        _REFERENCE["ports"] = ports
        _REFERENCE["ports_by_name"] = {p["port"]: p for p in ports}
        _REFERENCE["vessel_classes"] = _load_json("vessel_classes.json")
        _REFERENCE["routes"] = _load_json("routes.json")
        _REFERENCE["vessels"] = _load_json("vessels.json")

    return _REFERENCE


def resolve_route(origin, destination):
    """
    Find a lane. `origin` may be a country or a specific load port.

    When a country is given the nearest load port serving the discharge
    port is chosen, which is what a chartering desk would do.
    """

    data = reference_data()

    candidates = [
        r for r in data["routes"]
        if r["destination"] == destination
        and (r["origin"] == origin or r["origin_country"] == origin)
    ]

    if not candidates:
        raise ValueError(f"No route from {origin} to {destination}")

    return min(candidates, key=lambda r: r["distance"])


def available_vessels_for(load_port_name, vessel_type=None):
    data = reference_data()

    return [
        v for v in data["vessels"]
        if v["location"] == load_port_name
        and v["status"] == "available"
        and (vessel_type is None or v["vessel_type"] == vessel_type)
    ]


def run_decision_pipeline(
    origin,
    destination,
    cargo_quantity,
    cargo_value_per_ton=9500.0,
    annual_carrying_rate=0.08,
    storage_cost_per_day=0.0,
    operational_delay_cost_per_day=0.0,
    contract_duration_days=30,
    vessel_type=None,
    horizon_days=14,
):
    """
    Run every decision stage for one shipment enquiry.
    """

    data = reference_data()

    route = resolve_route(origin, destination)

    load_port = data["ports_by_name"][route["origin"]]
    discharge_port = data["ports_by_name"][route["destination"]]

    origin_country = route["origin_country"]

    # ----------------------------------------------------------
    # 1. Vessel class ranking  (requirement b)
    #
    # Run first, because the recommended class determines which rate
    # series every downstream stage should use.
    # ----------------------------------------------------------

    class_rates = forecast_service.rate_by_vessel_class(
        origin_country, destination, data["vessel_classes"], horizon_days
    )

    vessel_result = rank_vessel_classes(
        vessel_classes=data["vessel_classes"],
        load_port=load_port,
        discharge_port=discharge_port,
        cargo_quantity=cargo_quantity,
        distance_nm=route["distance"],
        rate_per_tonne_by_class=class_rates,
    )

    recommended = vessel_result["recommended"]

    # Honour an explicit user choice if it is feasible, otherwise use the
    # optimiser's pick and say so.
    chosen = recommended
    user_choice_infeasible = None

    if vessel_type:
        match = next(
            (o for o in vessel_result["ranked"] if o["vessel_type"] == vessel_type),
            None,
        )
        if match:
            chosen = match
        else:
            rejected = next(
                (o for o in vessel_result["rejected"]
                 if o["vessel_type"] == vessel_type),
                None,
            )
            if rejected:
                user_choice_infeasible = rejected

    if chosen is None:
        raise ValueError(
            f"No vessel class can serve {route['origin']} -> {destination}"
        )

    chosen_type = chosen["vessel_type"]

    # ----------------------------------------------------------
    # 2. Forecast for the chosen class
    # ----------------------------------------------------------

    forecast = forecast_service.forecast_lane(
        origin_country, destination, chosen_type, horizon_days
    )

    current_rate = forecast["current_rate"]

    # ----------------------------------------------------------
    # 3. Waiting cost, converted to $/tonne/day
    # ----------------------------------------------------------

    waiting_detail = calculate_waiting_cost(
        cargo_quantity=cargo_quantity,
        cargo_value_per_ton=cargo_value_per_ton,
        annual_carrying_rate=annual_carrying_rate,
        storage_cost_per_day=storage_cost_per_day,
        operational_delay_cost_per_day=operational_delay_cost_per_day,
    )

    waiting_cost_per_tonne_day = (
        waiting_detail["waiting_cost_per_day"] / cargo_quantity
        if cargo_quantity else 0.0
    )

    # Cost of waiting out the whole forecast horizon.
    waiting_cost_over_horizon = waiting_cost_per_tonne_day * horizon_days

    # ----------------------------------------------------------
    # 4. Charter now vs wait
    # ----------------------------------------------------------

    decision = calculate_charter_decision(
        current_rate=current_rate,
        forecast_best=forecast["best"],
        forecast_expected=forecast["expected"],
        forecast_worst=forecast["worst"],
        waiting_cost=waiting_cost_over_horizon,
    )

    # ----------------------------------------------------------
    # 5. Monte Carlo
    # ----------------------------------------------------------

    simulation = monte_carlo_simulation(
        current_rate=current_rate,
        forecast_best=forecast["best"],
        forecast_expected=forecast["expected"],
        forecast_worst=forecast["worst"],
        waiting_cost=waiting_cost_over_horizon,
    )

    # ----------------------------------------------------------
    # 6. Optimal market entry timing  (requirement a)
    # ----------------------------------------------------------

    stopping_model = LongstaffSchwartz(time_steps=horizon_days)

    timing = stopping_model.run(
        current_rate=current_rate,
        forecast_expected=forecast["expected"],
        forecast_best=forecast["best"],
        forecast_worst=forecast["worst"],
        waiting_cost=waiting_cost_per_tonne_day,
    )

    # ----------------------------------------------------------
    # 7. Idle scenario management  (requirement c)
    # ----------------------------------------------------------

    idle = analyse_idle(
        vessel_type=chosen_type,
        tonnes_per_voyage=chosen["tonnes_per_voyage"],
        load_port=load_port,
        discharge_port=discharge_port,
        sea_days=chosen["sea_days"],
        load_congestion=min(forecast["congestion"] * 1.1, 0.95),
        discharge_congestion=forecast["congestion"],
    )

    # ----------------------------------------------------------
    # 8. Spot vs term  (stated objective)
    # ----------------------------------------------------------

    contract = compare_spot_vs_term(
        forecast_series=[p["expected"] for p in forecast["series"]],
        current_rate=current_rate,
        cargo_quantity=cargo_quantity,
        contract_days=contract_duration_days,
        voyages_required=chosen["voyages_required"],
        volatility=max(forecast["recent_volatility"], current_rate * 0.03),
    )

    # ----------------------------------------------------------
    # 9. Risk warnings  (requirement d)
    # ----------------------------------------------------------

    open_vessels = available_vessels_for(load_port["port"], chosen_type)

    risk = build_risk_report(
        forecast_best=forecast["best"],
        forecast_expected=forecast["expected"],
        forecast_worst=forecast["worst"],
        load_port=load_port,
        discharge_port=discharge_port,
        load_congestion=min(forecast["congestion"] * 1.1, 0.95),
        discharge_congestion=forecast["congestion"],
        vessel_supply=forecast["vessel_supply"],
        available_vessels=len(open_vessels),
        net_expected_saving=decision["net_expected_saving"],
        waiting_cost=waiting_cost_over_horizon,
        probability_waiting_wins=timing["probability_waiting_wins"],
        recent_volatility=forecast["recent_volatility"],
    )

    # ----------------------------------------------------------
    # 10. Response
    # ----------------------------------------------------------

    return {
        "request": {
            "origin": origin,
            "origin_country": origin_country,
            "destination": destination,
            "cargo_quantity": cargo_quantity,
            "contract_duration_days": contract_duration_days,
            "requested_vessel_type": vessel_type,
            "horizon_days": horizon_days,
        },

        "route": {
            "load_port": load_port["port"],
            "load_port_unlocode": load_port["unlocode"],
            "load_port_lat": load_port["latitude"],
            "load_port_lon": load_port["longitude"],
            "discharge_port": discharge_port["port"],
            "discharge_port_unlocode": discharge_port["unlocode"],
            "discharge_port_lat": discharge_port["latitude"],
            "discharge_port_lon": discharge_port["longitude"],
            "distance_nm": route["distance"],
            "distance_source": route.get("distance_source"),
        },

        "forecast": {
            "best": forecast["best"],
            "expected": forecast["expected"],
            "worst": forecast["worst"],
            "current_rate": current_rate,
            "horizon_days": forecast["horizon_days"],
            "source": forecast["source"],
            "unit": "USD per tonne",
        },

        "forecast_series": forecast["series"],

        "decision": {
            **decision,
            "waiting_cost_per_tonne_day": round(waiting_cost_per_tonne_day, 4),
            "waiting_cost_detail": waiting_detail,
        },

        "confidence": decision["confidence"],
        "risk_level": decision["risk"],

        "optimal_timing": timing,

        "monte_carlo": simulation,

        "vessel_recommendation": {
            **vessel_result,
            "chosen": chosen,
            "user_choice_infeasible": user_choice_infeasible,
            "open_vessels": open_vessels,
        },

        "idle": idle,

        "contract_strategy": contract,

        "risk": risk,

        "model": {
            "metrics": forecast_service.load_metrics(),
            "feature_importance": forecast_service.load_feature_importance(),
        },
    }


if __name__ == "__main__":

    result = run_decision_pipeline(
        origin="Australia",
        destination="Paradip",
        cargo_quantity=120000,
        contract_duration_days=90,
    )

    print("=" * 62)
    print("CHARTER DECISION PIPELINE")
    print("=" * 62)

    r = result["route"]
    print(f"\nLane      : {r['load_port']} ({r['load_port_unlocode']}) -> "
          f"{r['discharge_port']} ({r['discharge_port_unlocode']})")
    print(f"Distance  : {r['distance_nm']:,} nm")

    f = result["forecast"]
    print(f"\nRate now  : ${f['current_rate']}/t")
    print(f"Forecast  : ${f['best']} / ${f['expected']} / ${f['worst']} per t")

    print(f"\n(a) Timing   : {result['optimal_timing']['decision']} — "
          f"{result['optimal_timing']['recommended_window']}")

    v = result["vessel_recommendation"]["chosen"]
    print(f"(b) Vessel   : {v['vessel_type']} @ ${v['cost_per_tonne_usd']}/t, "
          f"{v['voyages_required']} voyage(s)")

    print(f"(c) Idle     : {result['idle']['idle_days']} days "
          f"({result['idle']['idle_share'] * 100:.0f}% of round trip)")

    print(f"(d) Risk     : {result['risk']['overall_risk']} — "
          f"{result['risk']['alert_count']} alert(s)")

    print(f"Objective    : {result['contract_strategy']['recommendation']} "
          f"for {result['request']['contract_duration_days']} days")
