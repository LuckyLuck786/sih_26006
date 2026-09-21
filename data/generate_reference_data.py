"""
Reference-data generator for the Harborline charter-intelligence prototype.

Emits every static dataset the decision engine depends on:

    ports.json           load + discharge ports with physical restrictions
    vessel_classes.json  the four dry-bulk classes named in PS 26006
    vessels.json         a fleet positioned at the load ports
    routes.json          origin -> discharge sea distances
    synthetic/freight_rate.csv   multi-route, multi-class rate history

Run from the repository root:

    python data/generate_reference_data.py

Distances are great-circle values inflated by a routing factor, which
approximates the deviation a real sea route takes around land masses.
Where a Data Docked API key is configured the live /route-planner
endpoint supersedes these values at request time.
"""

import csv
import json
import math
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))

# Great-circle distance under-states a sea route because vessels must
# steer around land. 1.18 is a reasonable mean deviation for the
# Indian Ocean / Pacific lanes this prototype covers.
ROUTING_FACTOR = 1.18

EARTH_RADIUS_NM = 3440.065

SEED = 26006  # the problem-statement id, so runs are reproducible


# ==============================================================
# PORTS
# ==============================================================
#
# max_draft / max_LOA / max_beam are the physical restrictions that
# decide which vessel class may berth. cargo_handling_rate is in
# tonnes per day and drives turnaround and idle-time estimates.

PORTS = [
    # ---------- Discharge: East Coast of India (PS 26006) ----------
    {
        "port": "Paradip",
        "unlocode": "INPRT",
        "country": "India",
        "role": "discharge",
        "latitude": 20.2648,
        "longitude": 86.6753,
        "max_draft": 17.1,
        "max_LOA": 300,
        "max_beam": 50,
        "cargo_handling_rate": 35000,
        "berths": 4,
    },
    {
        "port": "Vizag",
        "unlocode": "INVTZ",
        "country": "India",
        "role": "discharge",
        "latitude": 17.6868,
        "longitude": 83.2185,
        "max_draft": 16.5,
        "max_LOA": 300,
        "max_beam": 48,
        "cargo_handling_rate": 32000,
        "berths": 4,
    },
    {
        "port": "Gangavaram",
        "unlocode": "INGGV",
        "country": "India",
        "role": "discharge",
        "latitude": 17.6200,
        "longitude": 83.2400,
        "max_draft": 21.0,
        "max_LOA": 330,
        "max_beam": 55,
        "cargo_handling_rate": 45000,
        "berths": 3,
    },
    {
        "port": "Gopalpur",
        "unlocode": "INGPR",
        "country": "India",
        "role": "discharge",
        "latitude": 19.2647,
        "longitude": 84.9080,
        "max_draft": 9.5,
        "max_LOA": 200,
        "max_beam": 32,
        "cargo_handling_rate": 18000,
        "berths": 2,
    },
    {
        "port": "Dhamra",
        "unlocode": "INDMR",
        "country": "India",
        "role": "discharge",
        "latitude": 20.7833,
        "longitude": 86.9667,
        "max_draft": 18.5,
        "max_LOA": 320,
        "max_beam": 50,
        "cargo_handling_rate": 40000,
        "berths": 3,
    },
    {
        "port": "Haldia",
        "unlocode": "INHAL",
        "country": "India",
        "role": "discharge",
        "latitude": 22.0333,
        "longitude": 88.0833,
        "max_draft": 8.5,
        "max_LOA": 240,
        "max_beam": 32,
        "cargo_handling_rate": 22000,
        "berths": 3,
    },
    {
        # Named explicitly in the problem statement. It is a lightering
        # anchorage rather than a berth, so handling is slower and the
        # governing restriction is the approach channel.
        "port": "Sagar-Sandheads",
        "unlocode": "INSGR",
        "country": "India",
        "role": "discharge",
        "latitude": 21.6500,
        "longitude": 88.0500,
        "max_draft": 10.5,
        "max_LOA": 300,
        "max_beam": 45,
        "cargo_handling_rate": 15000,
        "berths": 2,
    },
    # ---------- Load: Australia ----------
    {
        "port": "Newcastle",
        "unlocode": "AUNTL",
        "country": "Australia",
        "role": "load",
        "latitude": -32.9283,
        "longitude": 151.7817,
        "max_draft": 16.5,
        "max_LOA": 300,
        "max_beam": 50,
        "cargo_handling_rate": 60000,
        "berths": 5,
    },
    {
        "port": "Hay Point",
        "unlocode": "AUHPT",
        "country": "Australia",
        "role": "load",
        "latitude": -21.2744,
        "longitude": 149.3056,
        "max_draft": 19.4,
        "max_LOA": 330,
        "max_beam": 55,
        "cargo_handling_rate": 70000,
        "berths": 4,
    },
    {
        "port": "Port Hedland",
        "unlocode": "AUPHE",
        "country": "Australia",
        "role": "load",
        "latitude": -20.3100,
        "longitude": 118.5760,
        "max_draft": 19.0,
        "max_LOA": 330,
        "max_beam": 55,
        "cargo_handling_rate": 80000,
        "berths": 5,
    },
    # ---------- Load: Indonesia ----------
    {
        "port": "Banjarmasin",
        "unlocode": "IDBDJ",
        "country": "Indonesia",
        "role": "load",
        "latitude": -3.3167,
        "longitude": 114.5833,
        "max_draft": 14.0,
        "max_LOA": 290,
        "max_beam": 45,
        "cargo_handling_rate": 30000,
        "berths": 3,
    },
    {
        "port": "Samarinda",
        "unlocode": "IDSMD",
        "country": "Indonesia",
        "role": "load",
        "latitude": -0.5017,
        "longitude": 117.1536,
        "max_draft": 9.0,
        "max_LOA": 200,
        "max_beam": 32,
        "cargo_handling_rate": 20000,
        "berths": 2,
    },
    # ---------- Load: United States ----------
    {
        "port": "Baltimore",
        "unlocode": "USBAL",
        "country": "United States",
        "role": "load",
        "latitude": 39.2667,
        "longitude": -76.5833,
        "max_draft": 15.2,
        "max_LOA": 300,
        "max_beam": 48,
        "cargo_handling_rate": 35000,
        "berths": 3,
    },
    {
        "port": "New Orleans",
        "unlocode": "USMSY",
        "country": "United States",
        "role": "load",
        "latitude": 29.9511,
        "longitude": -90.0715,
        "max_draft": 13.7,
        "max_LOA": 290,
        "max_beam": 45,
        "cargo_handling_rate": 30000,
        "berths": 3,
    },
    # ---------- Load: Mozambique ----------
    {
        "port": "Beira",
        "unlocode": "MZBEW",
        "country": "Mozambique",
        "role": "load",
        "latitude": -19.8333,
        "longitude": 34.8333,
        "max_draft": 12.0,
        "max_LOA": 250,
        "max_beam": 40,
        "cargo_handling_rate": 18000,
        "berths": 2,
    },
    {
        "port": "Nacala",
        "unlocode": "MZMNC",
        "country": "Mozambique",
        "role": "load",
        "latitude": -14.5333,
        "longitude": 40.6667,
        "max_draft": 14.0,
        "max_LOA": 280,
        "max_beam": 45,
        "cargo_handling_rate": 22000,
        "berths": 2,
    },
    # ---------- Load: Russia ----------
    {
        "port": "Vostochny",
        "unlocode": "RUVYP",
        "country": "Russia",
        "role": "load",
        "latitude": 42.7500,
        "longitude": 133.0833,
        "max_draft": 16.5,
        "max_LOA": 300,
        "max_beam": 50,
        "cargo_handling_rate": 40000,
        "berths": 3,
    },
]


# ==============================================================
# VESSEL CLASSES
# ==============================================================
#
# Representative particulars for the four dry-bulk classes the
# problem statement names. Draft here is the loaded summer draft,
# which is what a port restriction is checked against.

VESSEL_CLASSES = [
    {
        "vessel_type": "Handysize",
        "dwt": 28000,
        "draft": 10.0,
        "LOA": 180,
        "beam": 28,
        "service_speed": 12.5,
        "daily_hire_usd": 9500,
        "bunker_tonnes_per_day": 18,
    },
    {
        "vessel_type": "Supramax",
        "dwt": 58000,
        "draft": 12.8,
        "LOA": 200,
        "beam": 32,
        "service_speed": 13.0,
        "daily_hire_usd": 13500,
        "bunker_tonnes_per_day": 24,
    },
    {
        "vessel_type": "Panamax",
        "dwt": 76000,
        "draft": 14.2,
        "LOA": 229,
        "beam": 32.3,
        "service_speed": 13.5,
        "daily_hire_usd": 16000,
        "bunker_tonnes_per_day": 30,
    },
    {
        "vessel_type": "Capesize",
        "dwt": 180000,
        "draft": 18.2,
        "LOA": 292,
        "beam": 45,
        "service_speed": 14.0,
        "daily_hire_usd": 24000,
        "bunker_tonnes_per_day": 42,
    },
]


VESSEL_NAMES = [
    "MV Ocean Star",
    "MV Eastern Pearl",
    "MV Bay Express",
    "MV Coastal Giant",
    "MV Indian Trader",
    "MV Southern Cross",
    "MV Bengal Pioneer",
    "MV Coral Horizon",
    "MV Kalinga Spirit",
    "MV Deccan Voyager",
    "MV Andaman Dawn",
    "MV Konark Mariner",
    "MV Utkal Navigator",
    "MV Godavari Belle",
    "MV Mahanadi Queen",
    "MV Sunda Breeze",
    "MV Pacific Ember",
    "MV Zambezi Star",
    "MV Nusantara Sun",
    "MV Timor Ranger",
    "MV Arafura Bell",
    "MV Chesapeake Lark",
    "MV Volga Crest",
    "MV Nampula Tide",
]


def haversine_nm(lat1, lon1, lat2, lon2):
    """Great-circle distance between two points, in nautical miles."""

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)

    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )

    return 2 * EARTH_RADIUS_NM * math.asin(math.sqrt(a))


def build_routes(ports):
    """Every load port paired with every discharge port."""

    load_ports = [p for p in ports if p["role"] == "load"]
    discharge_ports = [p for p in ports if p["role"] == "discharge"]

    routes = []

    for load in load_ports:
        for discharge in discharge_ports:
            great_circle = haversine_nm(
                load["latitude"],
                load["longitude"],
                discharge["latitude"],
                discharge["longitude"],
            )

            distance = round(great_circle * ROUTING_FACTOR)

            routes.append(
                {
                    "origin": load["port"],
                    "origin_unlocode": load["unlocode"],
                    "origin_country": load["country"],
                    "destination": discharge["port"],
                    "destination_unlocode": discharge["unlocode"],
                    "distance": distance,
                    "distance_source": "great_circle_x_routing_factor",
                }
            )

    return routes


def build_fleet(ports, vessel_classes, rng):
    """Position a fleet across the load ports, one vessel per name."""

    load_ports = [p for p in ports if p["role"] == "load"]

    fleet = []
    name_index = 0

    for load in load_ports:
        for spec in vessel_classes:
            # A port cannot host a class it physically cannot berth.
            if spec["draft"] > load["max_draft"]:
                continue
            if spec["LOA"] > load["max_LOA"]:
                continue
            if spec["beam"] > load["max_beam"]:
                continue

            if name_index >= len(VESSEL_NAMES):
                break

            # Most of the fleet is open; a minority is already fixed,
            # so the availability filter has something to exclude.
            status = "available" if rng.random() > 0.25 else "chartered"

            fleet.append(
                {
                    "vessel_id": f"VES{name_index + 1:03d}",
                    "vessel_name": VESSEL_NAMES[name_index],
                    "vessel_type": spec["vessel_type"],
                    "location": load["port"],
                    "location_unlocode": load["unlocode"],
                    "latitude": round(load["latitude"] + rng.uniform(-0.6, 0.6), 4),
                    "longitude": round(load["longitude"] + rng.uniform(-0.6, 0.6), 4),
                    "capacity": spec["dwt"],
                    "draft": spec["draft"],
                    "LOA": spec["LOA"],
                    "beam": spec["beam"],
                    "service_speed": spec["service_speed"],
                    "status": status,
                    "open_in_days": rng.randint(0, 9),
                }
            )

            name_index += 1

    return fleet


def build_freight_history(routes, vessel_classes, rng, days=540):
    """
    Build a daily rate history per origin-country / discharge / class.

    The series carries the structure a forecasting model needs to find:
    a slow trend, an annual seasonal swing, class and distance effects,
    and correlated congestion and supply signals.
    """

    from datetime import date, timedelta

    start = date(2024, 1, 1)

    # One representative load port per country keeps the dataset a
    # readable size while still covering every origin in the PS.
    representative = {}
    for route in routes:
        representative.setdefault(route["origin_country"], route["origin"])

    # Base $/tonne by class: bigger vessels are cheaper per tonne.
    base_rate = {
        "Handysize": 34.0,
        "Supramax": 28.0,
        "Panamax": 24.0,
        "Capesize": 18.0,
    }

    rows = []

    for route in routes:
        if representative[route["origin_country"]] != route["origin"]:
            continue

        for spec in vessel_classes:
            vessel_type = spec["vessel_type"]

            # Distance premium, normalised against a 4000 nm reference.
            distance_factor = 0.55 + 0.45 * (route["distance"] / 4000.0)

            level = base_rate[vessel_type] * distance_factor

            # Each lane/class gets its own random walk.
            drift = rng.uniform(-0.02, 0.03)
            rate = level

            for day_index in range(days):
                current = start + timedelta(days=day_index)

                # Annual seasonality: monsoon and restocking cycles.
                seasonal = 1.0 + 0.09 * math.sin(
                    2 * math.pi * (current.timetuple().tm_yday / 365.0)
                )

                # Mean-reverting walk around the seasonal level.
                target = level * seasonal
                rate += (target - rate) * 0.06
                rate += rng.gauss(0, level * 0.018) + drift * 0.01
                rate = max(rate, level * 0.45)

                congestion = min(
                    0.95,
                    max(
                        0.02,
                        0.18
                        + 0.12 * math.sin(2 * math.pi * (current.timetuple().tm_yday / 365.0) + 1.1)
                        + rng.gauss(0, 0.05),
                    ),
                )

                # Supply falls when congestion rises: ships are stuck.
                vessel_supply = max(
                    4,
                    int(38 - 28 * congestion + rng.gauss(0, 3)),
                )

                commodity_price = round(
                    108
                    + 16 * math.sin(2 * math.pi * (current.timetuple().tm_yday / 365.0) + 0.4)
                    + rng.gauss(0, 3),
                    2,
                )

                rows.append(
                    {
                        "date": current.isoformat(),
                        "origin": route["origin_country"],
                        "origin_port": route["origin"],
                        "destination": route["destination"],
                        "vessel_type": vessel_type,
                        "distance_nm": route["distance"],
                        "freight_rate": round(rate, 2),
                        "commodity_price": commodity_price,
                        "congestion": round(congestion, 3),
                        "vessel_supply": vessel_supply,
                    }
                )

    return rows


def main():

    rng = random.Random(SEED)

    ports = PORTS
    routes = build_routes(ports)
    fleet = build_fleet(ports, VESSEL_CLASSES, rng)

    write_json("ports.json", ports)
    write_json("vessel_classes.json", VESSEL_CLASSES)
    write_json("routes.json", routes)
    write_json("vessels.json", fleet)

    rows = build_freight_history(routes, VESSEL_CLASSES, rng)

    synthetic_dir = os.path.join(HERE, "synthetic")
    os.makedirs(synthetic_dir, exist_ok=True)

    csv_path = os.path.join(synthetic_dir, "freight_rate.csv")

    with open(csv_path, "w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    print(f"ports.json            {len(ports):>6} ports")
    print(f"vessel_classes.json   {len(VESSEL_CLASSES):>6} classes")
    print(f"routes.json           {len(routes):>6} lanes")
    print(f"vessels.json          {len(fleet):>6} vessels")
    print(f"freight_rate.csv      {len(rows):>6} rows")

    lanes = len({(r["origin"], r["destination"], r["vessel_type"]) for r in rows})
    print(f"                      {lanes:>6} distinct origin/destination/class series")


def write_json(name, payload):
    path = os.path.join(HERE, name)
    with open(path, "w") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")


if __name__ == "__main__":
    main()
