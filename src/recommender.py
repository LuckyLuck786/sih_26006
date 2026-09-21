from src.availability import get_available_vessels, load_vessels
from src.compatibility import check_port_compatibility


def recommend_vessel(origin, destination, vessel_type):
    """
    Find available vessels and return the first vessel
    that is compatible with the destination port.
    """

    available = get_available_vessels(origin, destination, vessel_type)

    if not available:
        return {"recommended": False, "reason": "No available vessels found"}

    all_vessels = load_vessels()

    for candidate in available:
        # Find complete vessel information
        vessel_data = None

        for vessel in all_vessels:
            if vessel["vessel_name"] == candidate["vessel"]:
                vessel_data = vessel
                break

        if vessel_data is None:
            continue

        compatibility = check_port_compatibility(vessel_data, destination)

        if compatibility["valid"]:
            return {
                "recommended": True,
                "vessel": candidate["vessel"],
                "type": candidate["type"],
                "distance": candidate["distance"],
                "available": candidate["available"],
                "port_compatible": True,
            }

    return {
        "recommended": False,
        "reason": "Available vessels found, but none are compatible with destination port",
    }
