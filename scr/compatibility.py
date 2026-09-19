import json
import os


def load_ports():
    """Load port data from ports.json."""

    file_path = os.path.join(
        os.path.dirname(__file__),
        "..",
        "data",
        "ports.json"
    )

    with open(file_path, "r") as file:
        return json.load(file)


def get_port(port_name):
    """Find a port by name."""

    ports = load_ports()

    for port in ports:
        if port["port"].lower() == port_name.lower():
            return port

    return None


def check_port_compatibility(vessel, port_name):
    """
    Check whether a vessel can safely use the specified port
    based on draft, LOA and beam.
    """

    port = get_port(port_name)

    if port is None:
        return {
            "valid": False,
            "reason": "Port not found"
        }

    draft_ok = vessel["draft"] <= port["max_draft"]
    loa_ok = vessel["LOA"] <= port["max_LOA"]
    beam_ok = vessel["beam"] <= port["max_beam"]

    if draft_ok and loa_ok and beam_ok:
        return {
            "valid": True,
            "reason": "Vessel is compatible with port"
        }

    reasons = []

    if not draft_ok:
        reasons.append("Draft exceeds port limit")

    if not loa_ok:
        reasons.append("LOA exceeds port limit")

    if not beam_ok:
        reasons.append("Beam exceeds port limit")

    return {
        "valid": False,
        "reason": ", ".join(reasons)
    }
