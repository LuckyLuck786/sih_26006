"""Command-line entry point for the Harborline charter decision engine.

Runs the full pipeline for a single shipment enquiry and prints the
result as a report or as JSON.

Examples
--------
    python main.py --origin Australia --destination Paradip --quantity 120000
    python main.py --origin Indonesia --destination Haldia --json
"""

from __future__ import annotations

import argparse
import json
import logging
import sys

from ml import pipeline


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="harborline",
        description="Freight forecasting and charter decision support (SIH PS 26006).",
    )

    parser.add_argument(
        "--origin",
        default="Australia",
        help="Origin country or load port (default: Australia)",
    )
    parser.add_argument(
        "--destination",
        default="Paradip",
        help="East Coast India discharge port (default: Paradip)",
    )
    parser.add_argument(
        "--quantity",
        type=float,
        default=120_000,
        help="Cargo parcel size in tonnes (default: 120000)",
    )
    parser.add_argument(
        "--vessel-class",
        default=None,
        choices=["Handysize", "Supramax", "Panamax", "Capesize"],
        help="Preferred class. Omit to let the optimiser choose.",
    )
    parser.add_argument(
        "--contract-days",
        type=int,
        default=90,
        help="Contract duration in days, drives spot vs term (default: 90)",
    )
    parser.add_argument(
        "--cargo-value",
        type=float,
        default=9_500.0,
        help="Cargo value per tonne, drives waiting cost (default: 9500)",
    )
    parser.add_argument("--json", action="store_true", help="Emit raw JSON")
    parser.add_argument("--verbose", "-v", action="store_true", help="Debug logging")

    return parser


def format_report(result: dict) -> str:
    """Render the pipeline result as a readable terminal report."""

    route = result["route"]
    forecast = result["forecast"]
    timing = result["optimal_timing"]
    vessel = result["vessel_recommendation"]["chosen"]
    idle = result["idle"]
    risk = result["risk"]
    contract = result["contract_strategy"]

    lines = [
        "=" * 64,
        "HARBORLINE CHARTER DECISION",
        "=" * 64,
        "",
        f"Lane       {route['load_port']} ({route['load_port_unlocode']})"
        f" -> {route['discharge_port']} ({route['discharge_port_unlocode']})",
        f"Distance   {route['distance_nm']:,} nm",
        f"Parcel     {result['request']['cargo_quantity']:,.0f} t",
        "",
        f"Rate now   ${forecast['current_rate']}/t",
        f"Forecast   ${forecast['best']} / ${forecast['expected']}"
        f" / ${forecast['worst']} per t  (Q10/Q50/Q90 @ {forecast['horizon_days']}d)",
        "",
        "-" * 64,
        f"(a) Timing    {timing['decision']} - {timing['recommended_window']}",
        f"              waiting wins in {timing['probability_waiting_wins']:.0%}"
        f" of simulated markets",
        f"(b) Vessel    {vessel['vessel_type']} @ ${vessel['cost_per_tonne_usd']}/t,"
        f" {vessel['voyages_required']} voyage(s)",
        f"              payload {vessel['max_payload_tonnes']:,} t"
        f" ({vessel['payload_utilisation']:.0%} of dwt)",
        f"(c) Idle      {idle['idle_days']} days"
        f" ({idle['idle_share']:.0%} of round trip),"
        f" demurrage ${idle['demurrage_cost_usd']:,}",
        f"(d) Risk      {risk['overall_risk']} - {risk['alert_count']} alert(s)",
        f"Objective     {contract['recommendation']} for {contract['contract_days']} days",
        "-" * 64,
    ]

    rejected = result["vessel_recommendation"]["rejected"]
    if rejected:
        lines.append("")
        lines.append("Excluded by port infrastructure:")
        lines.extend(
            f"  x {option['vessel_type']:10} {option['reasons'][0]}" for option in rejected
        )

    if risk["alerts"]:
        lines.append("")
        lines.append("Active warnings:")
        lines.extend(
            f"  [{alert['severity']:8}] {alert['title']}"
            for alert in risk["alerts"]
            if alert["category"] != "clear"
        )

    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.WARNING,
        format="%(levelname)s %(name)s: %(message)s",
    )

    try:
        result = pipeline.run_decision_pipeline(
            origin=args.origin,
            destination=args.destination,
            cargo_quantity=args.quantity,
            cargo_value_per_ton=args.cargo_value,
            contract_duration_days=args.contract_days,
            vessel_type=args.vessel_class,
        )
    except ValueError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(result, indent=2, default=str))
    else:
        print(format_report(result))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
