"""
Vessel-class optimisation for PS 26006 requirement (b).

The original prototype asked the user which vessel class to use and then
filtered a list. That is backwards: the problem statement asks the system
to *recommend* the class, given a cargo parcel and the physical
restrictions of both the load and the discharge port.

This module evaluates every class and ranks them by total landed cost per
tonne, rejecting the ones that physically cannot serve the lane and
explaining why.

The important subtlety is draft. A draft restriction does not simply
exclude a vessel — real bulk carriers call at shallow ports *part-laden*.
Haldia cannot take a fully loaded Panamax, but it can take a Panamax down
to roughly 29,000 t. Modelling that is what turns a yes/no check into a
procurement decision.
"""

import math


# A loaded bulk carrier floats at its summer draft. In ballast it sits at
# roughly 35% of that. Payload scales approximately linearly between the
# two, which is accurate enough for parcel sizing.
LIGHTSHIP_DRAFT_RATIO = 0.35

# Under-keel clearance the port authority requires. Deducted from the
# declared maximum draft before any payload calculation.
UNDER_KEEL_CLEARANCE_M = 0.5

# Indicative bunker price, US$ per tonne of fuel.
BUNKER_PRICE_USD_PER_TONNE = 620.0

# Port charges scale with vessel size; this is a per-DWT proxy per call.
PORT_CHARGE_USD_PER_DWT = 0.42


def draft_limited_payload(dwt, summer_draft, available_draft):
    """
    Maximum cargo a vessel can carry into a draft-restricted port.

    Returns tonnes. A vessel that cannot even enter in ballast returns 0.
    """

    usable_draft = available_draft - UNDER_KEEL_CLEARANCE_M

    lightship_draft = summer_draft * LIGHTSHIP_DRAFT_RATIO

    if usable_draft >= summer_draft:
        return float(dwt)

    if usable_draft <= lightship_draft:
        return 0.0

    utilisation = (
        (usable_draft - lightship_draft)
        / (summer_draft - lightship_draft)
    )

    return float(dwt) * utilisation


def assess_class(
    spec,
    load_port,
    discharge_port,
    cargo_quantity,
    distance_nm,
    freight_rate_per_tonne,
):
    """
    Evaluate a single vessel class against one lane and cargo parcel.

    Returns a dict describing feasibility, payload, voyage economics and
    the reason for any rejection.
    """

    vessel_type = spec["vessel_type"]

    blockers = []

    # ----------------------------------------------------------
    # 1. Hard physical limits
    #
    # Length and beam are absolute: a vessel either fits the berth
    # envelope or it does not.
    # ----------------------------------------------------------

    for port in (load_port, discharge_port):

        if spec["LOA"] > port["max_LOA"]:
            blockers.append(
                f"LOA {spec['LOA']}m exceeds {port['port']} limit "
                f"{port['max_LOA']}m"
            )

        if spec["beam"] > port["max_beam"]:
            blockers.append(
                f"Beam {spec['beam']}m exceeds {port['port']} limit "
                f"{port['max_beam']}m"
            )

    # ----------------------------------------------------------
    # 2. Draft-limited payload at each end
    # ----------------------------------------------------------

    load_payload = draft_limited_payload(
        spec["dwt"], spec["draft"], load_port["max_draft"]
    )

    discharge_payload = draft_limited_payload(
        spec["dwt"], spec["draft"], discharge_port["max_draft"]
    )

    payload = min(load_payload, discharge_payload)

    binding_port = (
        discharge_port["port"]
        if discharge_payload <= load_payload
        else load_port["port"]
    )

    if payload <= 0:
        blockers.append(
            f"Draft at {binding_port} "
            f"({min(load_port['max_draft'], discharge_port['max_draft'])}m) "
            f"cannot float a {vessel_type} even in ballast"
        )

    if blockers:
        return {
            "vessel_type": vessel_type,
            "feasible": False,
            "reasons": blockers,
            "max_payload_tonnes": round(max(payload, 0.0)),
            "dwt": spec["dwt"],
        }

    # ----------------------------------------------------------
    # 3. Voyage structure
    # ----------------------------------------------------------

    voyages = max(1, math.ceil(cargo_quantity / payload))

    # Cargo actually lifted per voyage once the parcel is split evenly.
    per_voyage_tonnes = cargo_quantity / voyages

    utilisation = per_voyage_tonnes / spec["dwt"]

    sea_days = distance_nm / (spec["service_speed"] * 24.0)

    load_days = per_voyage_tonnes / load_port["cargo_handling_rate"]
    discharge_days = per_voyage_tonnes / discharge_port["cargo_handling_rate"]

    port_days = load_days + discharge_days

    # Laden out, ballast back.
    round_trip_days = (sea_days * 2.0) + port_days

    # ----------------------------------------------------------
    # 4. Cost build-up
    #
    # Freight is what the charterer pays the owner. Hire and bunkers are
    # shown because they explain *why* a bigger ship is cheaper per tonne
    # even though it costs more per day.
    # ----------------------------------------------------------

    freight_cost = freight_rate_per_tonne * cargo_quantity

    hire_cost = spec["daily_hire_usd"] * round_trip_days * voyages

    bunker_cost = (
        spec["bunker_tonnes_per_day"]
        * (sea_days * 2.0)
        * voyages
        * BUNKER_PRICE_USD_PER_TONNE
    )

    port_charges = (
        PORT_CHARGE_USD_PER_DWT * spec["dwt"] * voyages * 2
    )

    total_cost = freight_cost + hire_cost + bunker_cost + port_charges

    cost_per_tonne = total_cost / cargo_quantity if cargo_quantity else 0.0

    # ----------------------------------------------------------
    # 5. Utilisation penalty
    #
    # A class that leaves a lot of deadweight unused wastes money even
    # when its headline rate looks attractive. Surfacing this is what the
    # problem statement calls "suboptimal utilisation".
    # ----------------------------------------------------------

    notes = []

    if utilisation < 0.6:
        notes.append(
            f"Only {utilisation * 100:.0f}% of deadweight used — "
            f"parcel is small for this class"
        )

    if payload < spec["dwt"] * 0.95:
        notes.append(
            f"Draft-limited at {binding_port} to "
            f"{payload:,.0f} t of {spec['dwt']:,} t capacity"
        )

    if voyages > 1:
        notes.append(f"Parcel requires {voyages} voyages")

    return {
        "vessel_type": vessel_type,
        "feasible": True,
        "reasons": [],
        "notes": notes,
        "dwt": spec["dwt"],
        "max_payload_tonnes": round(payload),
        "binding_port": binding_port,
        "payload_utilisation": round(utilisation, 3),
        "voyages_required": voyages,
        "tonnes_per_voyage": round(per_voyage_tonnes),
        "sea_days": round(sea_days, 1),
        "port_days": round(port_days, 1),
        "round_trip_days": round(round_trip_days, 1),
        "freight_cost_usd": round(freight_cost),
        "hire_cost_usd": round(hire_cost),
        "bunker_cost_usd": round(bunker_cost),
        "port_charges_usd": round(port_charges),
        "total_cost_usd": round(total_cost),
        "cost_per_tonne_usd": round(cost_per_tonne, 2),
    }


def rank_vessel_classes(
    vessel_classes,
    load_port,
    discharge_port,
    cargo_quantity,
    distance_nm,
    rate_per_tonne_by_class,
):
    """
    Evaluate every class and return them ranked by cost per tonne.

    Feasible options come first, cheapest first. Infeasible options are
    retained with their rejection reasons, because showing *why* a
    Capesize cannot call at Haldia is as valuable as the recommendation.
    """

    assessed = []

    for spec in vessel_classes:

        rate = rate_per_tonne_by_class.get(
            spec["vessel_type"],
            rate_per_tonne_by_class.get("default", 0.0),
        )

        assessed.append(
            assess_class(
                spec=spec,
                load_port=load_port,
                discharge_port=discharge_port,
                cargo_quantity=cargo_quantity,
                distance_nm=distance_nm,
                freight_rate_per_tonne=rate,
            )
        )

    feasible = [a for a in assessed if a["feasible"]]
    rejected = [a for a in assessed if not a["feasible"]]

    feasible.sort(key=lambda a: a["cost_per_tonne_usd"])

    for position, option in enumerate(feasible, start=1):
        option["rank"] = position

    recommended = feasible[0] if feasible else None

    # How much the best option saves against the next feasible one.
    saving_vs_next = None

    if len(feasible) >= 2:
        saving_vs_next = round(
            (feasible[1]["cost_per_tonne_usd"] - feasible[0]["cost_per_tonne_usd"])
            * cargo_quantity
        )

    return {
        "recommended": recommended,
        "ranked": feasible,
        "rejected": rejected,
        "saving_vs_next_best_usd": saving_vs_next,
    }


if __name__ == "__main__":

    import json
    import os

    root = os.path.join(os.path.dirname(__file__), "..", "..")

    with open(os.path.join(root, "data", "ports.json")) as handle:
        ports = {p["port"]: p for p in json.load(handle)}

    with open(os.path.join(root, "data", "vessel_classes.json")) as handle:
        classes = json.load(handle)

    rates = {
        "Handysize": 34.0,
        "Supramax": 28.0,
        "Panamax": 24.0,
        "Capesize": 18.0,
    }

    for discharge in ["Gangavaram", "Paradip", "Haldia"]:

        result = rank_vessel_classes(
            vessel_classes=classes,
            load_port=ports["Newcastle"],
            discharge_port=ports[discharge],
            cargo_quantity=120000,
            distance_nm=5793,
            rate_per_tonne_by_class=rates,
        )

        print("=" * 62)
        print(f"Newcastle -> {discharge}, 120,000 t")
        print("=" * 62)

        for option in result["ranked"]:
            print(
                f"  {option['rank']}. {option['vessel_type']:10} "
                f"${option['cost_per_tonne_usd']:>7}/t  "
                f"{option['voyages_required']} voyage(s)  "
                f"payload {option['max_payload_tonnes']:,}"
            )

        for option in result["rejected"]:
            print(f"  x  {option['vessel_type']:10} {option['reasons'][0]}")

        print()
