import json
import os


def load_ais_data():
    """Load simulated AIS data from ais.json."""

    file_path = os.path.join(os.path.dirname(__file__), "..", "data", "ais.json")

    with open(file_path) as file:
        return json.load(file)


def get_vessel_position(vessel_id):
    """Get the latest simulated AIS position for a vessel."""

    ais_data = load_ais_data()

    for record in ais_data:
        if record["vessel_id"].lower() == vessel_id.lower():
            return record

    return None
