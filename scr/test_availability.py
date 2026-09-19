from availability import get_available_vessels


results = get_available_vessels(
    "Paradip",
    "Vizag",
    "Supramax"
)

print("Available vessels:")

for vessel in results:
    print(vessel)
