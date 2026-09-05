"""Static stop registry for the Cyberjaya demo corridor.

Real deployments would load this from GTFS. These are approximate Cyberjaya
coordinates chosen to trace a plausible south-to-north corridor so the
simulated vehicles move along realistic geometry — they are demo fixtures,
not surveyed transit data.
"""

from __future__ import annotations

from app.schemas.common import Coordinates

STOPS: dict[str, Coordinates] = {
    "stop_01": Coordinates(lat=2.9095, lng=101.6625),  # Tamarind Square
    "stop_02": Coordinates(lat=2.9213, lng=101.6559),  # Shaftsbury Square
    "stop_03": Coordinates(lat=2.9265, lng=101.6520),  # Cyberjaya Transport Terminal
    "stop_04": Coordinates(lat=2.9276, lng=101.6416),  # MMU Cyberjaya
}

STOP_NAMES: dict[str, str] = {
    "stop_01": "Tamarind Square",
    "stop_02": "Shaftsbury Square",
    "stop_03": "Cyberjaya Transport Terminal",
    "stop_04": "MMU Cyberjaya",
}

STOP_ORDER: list[str] = ["stop_01", "stop_02", "stop_03", "stop_04"]


def location_of(stop_id: str) -> Coordinates | None:
    return STOPS.get(stop_id)


def next_stop(stop_id: str) -> str:
    """The following stop on the corridor, wrapping at the end."""
    if stop_id not in STOP_ORDER:
        return STOP_ORDER[0]
    return STOP_ORDER[(STOP_ORDER.index(stop_id) + 1) % len(STOP_ORDER)]
