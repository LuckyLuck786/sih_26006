"""Shared fixtures.

Reference data is loaded once per session: it is read-only and the JSON
parse is wasted work if repeated per test.
"""

from __future__ import annotations

import json
import os
import sys

import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)


def _load(name: str):
    with open(os.path.join(REPO_ROOT, "data", name)) as handle:
        return json.load(handle)


@pytest.fixture(scope="session")
def ports() -> dict:
    """Ports keyed by name."""
    return {port["port"]: port for port in _load("ports.json")}


@pytest.fixture(scope="session")
def vessel_classes() -> list:
    return _load("vessel_classes.json")


@pytest.fixture(scope="session")
def routes() -> list:
    return _load("routes.json")


@pytest.fixture(scope="session")
def fleet() -> list:
    return _load("vessels.json")


@pytest.fixture(scope="session")
def forecast_series() -> list[float]:
    """A gently rising 90-day rate curve."""
    return [29.0 + 0.02 * day for day in range(90)]
