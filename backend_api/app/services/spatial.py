"""Spatial primitives for transit routing and approach-path checks.

Pure functions over WGS84 coordinates — no dependencies beyond the stdlib, so
the routing layer stays testable without a GIS stack.
"""

from __future__ import annotations

from math import asin, atan2, cos, degrees, radians, sin, sqrt

from app.schemas.common import Coordinates

EARTH_RADIUS_M = 6_371_000.0


def haversine_m(a: Coordinates, b: Coordinates) -> float:
    """Great-circle distance in metres."""
    lat1, lat2 = radians(a.lat), radians(b.lat)
    dlat = lat2 - lat1
    dlng = radians(b.lng - a.lng)
    h = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_M * asin(sqrt(h))


def bearing_degrees(origin: Coordinates, target: Coordinates) -> float:
    """Initial compass bearing from origin to target, 0-360."""
    lat1, lat2 = radians(origin.lat), radians(target.lat)
    dlng = radians(target.lng - origin.lng)
    y = sin(dlng) * cos(lat2)
    x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dlng)
    return (degrees(atan2(y, x)) + 360.0) % 360.0


def eta_seconds(distance_m: float, speed_kmh: float, *, floor_kmh: float = 5.0) -> int:
    """Seconds to cover `distance_m` at `speed_kmh`.

    A stopped vehicle has no meaningful ETA from speed alone, so the estimate
    falls back to `floor_kmh` (roughly congested-street pace) rather than
    returning infinity and blanking the rider's countdown at every red light.
    """
    speed = max(speed_kmh, floor_kmh)
    return int(round(distance_m / (speed * 1000.0 / 3600.0)))


def is_near_path(
    point: Coordinates, path: list[Coordinates], *, corridor_m: float = 40.0
) -> bool:
    """Whether `point` falls within `corridor_m` of any leg of `path`.

    Used to decide if an obstacle actually blocks a vehicle's approach rather
    than merely sitting near it on the map.
    """
    if not path:
        return False
    if len(path) == 1:
        return haversine_m(point, path[0]) <= corridor_m
    return any(
        _distance_to_segment_m(point, path[i], path[i + 1]) <= corridor_m
        for i in range(len(path) - 1)
    )


def _distance_to_segment_m(p: Coordinates, a: Coordinates, b: Coordinates) -> float:
    """Distance from p to segment ab, using a local equirectangular projection.

    Exact great-circle cross-track is overkill at the tens-of-metres scale this
    is asked about; the projection error over a single city block is well under
    the corridor width.
    """
    lat0 = radians((a.lat + b.lat) / 2.0)
    scale = cos(lat0)

    def xy(c: Coordinates) -> tuple[float, float]:
        return (radians(c.lng) * scale * EARTH_RADIUS_M, radians(c.lat) * EARTH_RADIUS_M)

    px, py = xy(p)
    ax, ay = xy(a)
    bx, by = xy(b)
    dx, dy = bx - ax, by - ay
    seg_len_sq = dx * dx + dy * dy
    if seg_len_sq == 0.0:
        return sqrt((px - ax) ** 2 + (py - ay) ** 2)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg_len_sq))
    cx, cy = ax + t * dx, ay + t * dy
    return sqrt((px - cx) ** 2 + (py - cy) ** 2)
