import sys
import os

# Add the src folder to Python's search path
src_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src")
sys.path.insert(0, src_path)

from scr.availability import get_available_vessels
from scr.recommender import recommend_vessel
from scr.ais import get_vessel_position


def main():

    # Example shipment request
    origin = "Paradip"
    destination = "Vizag"
    vessel_type = "Supramax"

    print("=" * 50)
    print("VESSEL & ROUTE MODULE")
    print("=" * 50)

    print("\nShipment Request")
    print("Origin:", origin)
    print("Destination:", destination)
    print("Vessel Type:", vessel_type)

    # Step 1: Find available vessels
    vessels = get_available_vessels(
        origin,
        destination,
        vessel_type
    )

    print("\nAvailable Vessels:")

    if not vessels:
        print("No vessels available.")
    else:
        for vessel in vessels:
            print(
                f"- {vessel['vessel']} | "
                f"{vessel['type']} | "
                f"{vessel['distance']} km | "
                f"Available: {vessel['available']}"
            )

    # Step 2: Recommend compatible vessel
    recommendation = recommend_vessel(
        origin,
        destination,
        vessel_type
    )

    print("\nRecommendation:")

    if recommendation["recommended"]:

        print("Vessel:", recommendation["vessel"])
        print("Type:", recommendation["type"])
        print("Distance:", recommendation["distance"], "km")
        print("Available:", recommendation["available"])
        print(
            "Port Compatible:",
            recommendation["port_compatible"]
        )

        # Step 3: Get mock AIS data
        for vessel in vessels:

            if vessel["vessel"] == recommendation["vessel"]:

                # Find vessel ID from vessel database
                from scr.availability import load_vessels

                all_vessels = load_vessels()

                for vessel_data in all_vessels:

                    if vessel_data["vessel_name"] == vessel["vessel"]:

                        position = get_vessel_position(
                            vessel_data["vessel_id"]
                        )

                        if position:
                            print("\nMock AIS:")
                            print(
                                "Latitude:",
                                position["latitude"]
                            )
                            print(
                                "Longitude:",
                                position["longitude"]
                            )
                            print(
                                "Speed:",
                                position["speed"],
                                "knots"
                            )
                            print(
                                "Heading:",
                                position["heading"],
                                "degrees"
                            )

                        break

                break

    else:
        print(recommendation["reason"])

    print("\n" + "=" * 50)


if __name__ == "__main__":
    main()