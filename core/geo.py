"""Geodesic primitives shared by the routing and scheduling layers.

NOTE ON DUPLICATION: `backend_api/app/services/spatial.py` carries the same
haversine formula. It cannot be imported from here because it depends on
`app.schemas.common.Coordinates` and therefore on the `app.` import root that
only exists when uvicorn runs with `backend_api/` as the working directory.
Consolidating the two means making `backend_api` a proper package first; that
refactor is deliberately out of scope here rather than done halfway. If you
change the formula, change it in both places.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import asin, cos, radians, sin, sqrt

EARTH_RADIUS_M = 6_371_000.0


@dataclass(frozen=True)
class GeoPoint:
    """WGS84 latitude/longitude pair."""

    lat: float
    lng: float

    def __post_init__(self) -> None:
        if not -90.0 <= self.lat <= 90.0:
            raise ValueError(f"lat out of range: {self.lat}")
        if not -180.0 <= self.lng <= 180.0:
            raise ValueError(f"lng out of range: {self.lng}")


def haversine_m(a: GeoPoint, b: GeoPoint) -> float:
    """Great-circle distance in metres."""
    lat1, lat2 = radians(a.lat), radians(b.lat)
    dlat = lat2 - lat1
    dlng = radians(b.lng - a.lng)
    h = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_M * asin(sqrt(h))


def travel_seconds(distance_m: float, speed_kmh: float, *, floor_kmh: float = 5.0) -> float:
    """Seconds to cover `distance_m`.

    A stalled vehicle has no meaningful ETA from speed alone, so the estimate
    falls back to `floor_kmh` rather than returning infinity and blanking the
    rider's countdown at every red light.
    """
    return distance_m / (max(speed_kmh, floor_kmh) * 1000.0 / 3600.0)
