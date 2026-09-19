import json
import os


def load_vessels():
    """Load vessel data from vessels.json."""

    file_path = os.path.join(
        os.path.dirname(__file__),
        "..",
        "data",
        "vessels.json"
    )

    with open(file_path, "r") as file:
        return json.load(file)


def load_routes():
    """Load route data from routes.json."""

    file_path = os.path.join(
        os.path.dirname(__file__),
        "..",
        "data",
        "routes.json"
    )

    with open(file_path, "r") as file:
        return json.load(file)


def get_route_distance(origin, destination):
    """Find the distance between origin and destination."""

    routes = load_routes()

    for route in routes:
        if (
            route["origin"].lower() == origin.lower()
            and route["destination"].lower() == destination.lower()
        ):
            return route["distance"]

        # Also allow the reverse direction
        if (
            route["origin"].lower() == destination.lower()
            and route["destination"].lower() == origin.lower()
        ):
            return route["distance"]

    return None


def get_available_vessels(origin, destination, vessel_type):
    """
    Find available vessels matching the origin and vessel type,
    and attach the route distance.
    """

    vessels = load_vessels()
    distance = get_route_distance(origin, destination)

    if distance is None:
        return []

    available_vessels = []

    for vessel in vessels:
        if (
            vessel["location"].lower() == origin.lower()
            and vessel["vessel_type"].lower() == vessel_type.lower()
            and vessel["status"].lower() == "available"
        ):
            available_vessels.append({
                "vessel": vessel["vessel_name"],
                "type": vessel["vessel_type"],
                "distance": distance,
                "available": True
            })

    return available_vessels
