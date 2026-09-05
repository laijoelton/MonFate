"""Cyberjaya transit hubs with accessibility demographics.

Coordinates are **approximate** and the demographic rates are **mock** — they
are demo fixtures shaped to be plausible for the corridor, not surveyed census
or GTFS data. Anything published from these numbers must say so; presenting
invented disability rates as measured fact about a real community would be a
far worse failure than an inaccurate ETA.

The two rates drive real behaviour rather than sitting in a dashboard:

* ``elderly_pct`` (share of riders 60+) and ``oku_pct`` (share who are Persons
  with Disabilities / wheelchair users) both lengthen predicted dwell, because
  boarding takes longer where more riders need the ramp or extra time.
* ``oku_pct`` additionally drives **ramp pre-dispatch**: above a threshold the
  optimizer tells the vehicle to deploy on approach instead of waiting to be
  asked, which removes the request round-trip from the boarding path.
"""

from __future__ import annotations

from dataclasses import dataclass

from core.geo import GeoPoint, haversine_m

#: Above this OKU share, a station gets ramp pre-dispatch on approach.
RAMP_PREDISPATCH_OKU_PCT = 12.0

#: Weighted score (`elderly_pct + 2 * oku_pct`) mapped to an accessibility load
#: of 1.0. DPULZE, the corridor's heaviest stop, scores 48 — leaving headroom so
#: the scale still discriminates if a busier station is added.
LOAD_CEILING = 60.0


@dataclass(frozen=True)
class Station:
    """A Cyberjaya transit hub and its accessibility profile."""

    station_id: str
    name: str
    location: GeoPoint
    elderly_pct: float
    oku_pct: float
    #: Baseline seconds of dwell before demographic and live adjustments.
    base_dwell_s: int = 20
    #: Whether the platform itself has a working step-free path.
    step_free: bool = True

    def __post_init__(self) -> None:
        for field_name in ("elderly_pct", "oku_pct"):
            value = getattr(self, field_name)
            if not 0.0 <= value <= 100.0:
                raise ValueError(f"{field_name} must be a percentage 0-100, got {value}")

    @property
    def accessibility_load(self) -> float:
        """Combined 0-1 pressure this station puts on boarding time.

        OKU is weighted roughly double elderly share: a wheelchair boarding
        needs the ramp cycle, not just a slower walk. Normalised against the
        `LOAD_CEILING` weighted score, set above the busiest stop in the
        corridor — if the scale saturated there, every station added above it
        would score identically and the ordering would silently stop working.
        """
        weighted = self.elderly_pct + 2.0 * self.oku_pct
        return min(1.0, weighted / LOAD_CEILING)

    @property
    def needs_ramp_predispatch(self) -> bool:
        return self.oku_pct >= RAMP_PREDISPATCH_OKU_PCT or not self.step_free


STATIONS: dict[str, Station] = {
    "cbj_city_centre": Station(
        station_id="cbj_city_centre",
        name="MRT Cyberjaya City Centre",
        location=GeoPoint(lat=2.9226, lng=101.6540),
        elderly_pct=9.5,
        oku_pct=6.2,
        base_dwell_s=25,
    ),
    "cbj_utara": Station(
        station_id="cbj_utara",
        name="MRT Cyberjaya Utara",
        location=GeoPoint(lat=2.9450, lng=101.6620),
        elderly_pct=7.1,
        oku_pct=4.0,
        base_dwell_s=22,
    ),
    "dpulze": Station(
        station_id="dpulze",
        name="DPULZE Bus Terminal",
        location=GeoPoint(lat=2.9213, lng=101.6559),
        # Retail and clinic catchment: the highest combined accessibility load
        # in the corridor, and the station the optimizer should protect.
        elderly_pct=18.4,
        oku_pct=14.8,
        base_dwell_s=30,
    ),
    "cyber9_dell": Station(
        station_id="cyber9_dell",
        name="Cyber 9 / Dell-Rekan Hub",
        location=GeoPoint(lat=2.9310, lng=101.6455),
        # Office campus, commuter-skewed and young.
        elderly_pct=3.2,
        oku_pct=2.1,
        base_dwell_s=18,
    ),
    "shaftsbury": Station(
        station_id="shaftsbury",
        name="Shaftsbury Square",
        location=GeoPoint(lat=2.9192, lng=101.6558),
        elderly_pct=11.0,
        oku_pct=8.5,
        base_dwell_s=24,
    ),
}

#: Arterial corridors between hubs. Undirected; `(a, b)` implies `(b, a)`.
#: `base_speed_kmh` is free-flow; live traffic density scales it down.
CORRIDORS: list[tuple[str, str, float]] = [
    ("cbj_city_centre", "dpulze", 40.0),
    ("cbj_city_centre", "cyber9_dell", 50.0),
    ("cbj_city_centre", "cbj_utara", 55.0),
    ("dpulze", "shaftsbury", 35.0),
    ("shaftsbury", "cyber9_dell", 45.0),
    ("cyber9_dell", "cbj_utara", 50.0),
    ("dpulze", "cbj_utara", 45.0),
]


def station(station_id: str) -> Station:
    try:
        return STATIONS[station_id]
    except KeyError as exc:
        raise KeyError(f"unknown station: {station_id!r}") from exc


def all_station_ids() -> list[str]:
    return list(STATIONS)


def neighbours(station_id: str) -> list[tuple[str, float]]:
    """Adjacent stations as `(station_id, base_speed_kmh)`."""
    out: list[tuple[str, float]] = []
    for a, b, speed in CORRIDORS:
        if a == station_id:
            out.append((b, speed))
        elif b == station_id:
            out.append((a, speed))
    return out


def corridor_id(a: str, b: str) -> str:
    """Stable undirected key for a corridor, for traffic and obstacle lookups."""
    return "::".join(sorted((a, b)))


def corridor_distance_m(a: str, b: str) -> float:
    return haversine_m(station(a).location, station(b).location)
