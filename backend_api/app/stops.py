"""Static stop registry for the demo corridor.

Real deployments would load this from GTFS. Coordinates trace a short downtown
corridor so the simulated vehicles move along plausible geometry.
"""

from __future__ import annotations

from app.schemas.common import Coordinates

STOPS: dict[str, Coordinates] = {
    "stop_01": Coordinates(lat=3.1466, lng=101.6958),  # Central Interchange
    "stop_02": Coordinates(lat=3.1502, lng=101.7011),  # Museum
    "stop_03": Coordinates(lat=3.1548, lng=101.7074),  # Riverside Park
    "stop_04": Coordinates(lat=3.1589, lng=101.7128),  # Hospital
}

STOP_NAMES: dict[str, str] = {
    "stop_01": "Central Interchange",
    "stop_02": "Museum",
    "stop_03": "Riverside Park",
    "stop_04": "Hospital",
}

STOP_ORDER: list[str] = ["stop_01", "stop_02", "stop_03", "stop_04"]


def location_of(stop_id: str) -> Coordinates | None:
    return STOPS.get(stop_id)


def next_stop(stop_id: str) -> str:
    """The following stop on the corridor, wrapping at the end."""
    if stop_id not in STOP_ORDER:
        return STOP_ORDER[0]
    return STOP_ORDER[(STOP_ORDER.index(stop_id) + 1) % len(STOP_ORDER)]
