from availability import load_vessels
from compatibility import check_port_compatibility


vessels = load_vessels()

for vessel in vessels:
    result = check_port_compatibility(
        vessel,
        "Paradip"
    )

    print(
        vessel["vessel_name"],
        "→",
        "VALID" if result["valid"] else "REJECTED",
        "|",
        result["reason"]
    )
