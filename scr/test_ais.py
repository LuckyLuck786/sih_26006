from ais import get_vessel_position


position = get_vessel_position("VES001")

print("AIS Data:")

if position:
    print("Vessel ID:", position["vessel_id"])
    print("Latitude:", position["latitude"])
    print("Longitude:", position["longitude"])
    print("Speed:", position["speed"], "knots")
    print("Heading:", position["heading"], "degrees")
    print("Timestamp:", position["timestamp"])
else:
    print("Vessel not found")
