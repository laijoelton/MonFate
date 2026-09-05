"""Arrival and dwell forecasting.

Carries over the fail-closed contract from the frame's ml_analytics module: the
caller never gets a bare exception, only a structured status it can render.
A rider staring at a blank ETA does not know whether the bus is late or the
service is broken, so every failure mode is named.

Statuses:
    ok                  a real estimate
    cold_start          not enough telemetry to estimate yet
    stale               newest telemetry too old to trust
    unavailable         vehicle unknown / no route data
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone

from app.schemas.common import Coordinates
from app.schemas.vehicle import TransitVehicle
from app.services.spatial import eta_seconds, haversine_m

MAX_STALENESS = timedelta(seconds=90)

#: Extra seconds a vehicle spends at a stop when an assistive boarding happens.
#: Ramp deploy, board, secure, stow. Sourced from operator guidance rather than
#: learned — with no historical dataset yet, an honest constant beats a model
#: fitted to nothing.
DWELL_BASE_S = 20
DWELL_BY_LABEL: dict[str, int] = {
    "wheelchair": 65,
    "mobility_aid": 40,
    "stroller": 30,
}


@dataclass
class ArrivalForecast:
    status: str
    vehicle_id: str | None = None
    stop_id: str | None = None
    eta_seconds: int | None = None
    distance_m: float | None = None
    predicted_dwell_s: int | None = None
    confidence: str | None = None
    detail: str | None = None
    horizons: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v is not None and v != {}}


def predict_arrival(
    vehicle: TransitVehicle | None,
    stop_location: Coordinates | None,
    stop_id: str,
    *,
    assistive_labels: list[str] | None = None,
    now: datetime | None = None,
) -> ArrivalForecast:
    """Forecast when `vehicle` reaches `stop_id`, and how long it will dwell."""
    if vehicle is None or stop_location is None:
        return ArrivalForecast("unavailable", stop_id=stop_id, detail="unknown vehicle or stop")

    now = now or datetime.now(timezone.utc)
    last_seen = vehicle.last_updated_at
    if last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=timezone.utc)
    age = now - last_seen
    if age > MAX_STALENESS:
        return ArrivalForecast(
            "stale",
            vehicle_id=vehicle.vehicle_id,
            stop_id=stop_id,
            detail=f"telemetry {int(age.total_seconds())}s old",
        )

    distance = haversine_m(vehicle.location, stop_location)
    eta = eta_seconds(distance, vehicle.speed_kmh)
    dwell = predict_dwell(assistive_labels or [])

    # A stopped vehicle's ETA rests on the speed floor, not observed motion, so
    # say so rather than presenting a guess with the same weight as a measurement.
    confidence = "low" if vehicle.speed_kmh < 1.0 else "high" if distance < 2000 else "medium"

    return ArrivalForecast(
        "ok",
        vehicle_id=vehicle.vehicle_id,
        stop_id=stop_id,
        eta_seconds=eta,
        distance_m=round(distance, 1),
        predicted_dwell_s=dwell,
        confidence=confidence,
        horizons={
            "arrival_s": eta,
            "doors_open_s": eta,
            "departure_s": eta + dwell,
        },
    )


def predict_dwell(assistive_labels: list[str]) -> int:
    """Predicted seconds at the stop given who is waiting to board.

    Concurrent boardings overlap rather than queue end-to-end, so the estimate
    takes the slowest boarding plus a small increment for each additional one.
    """
    if not assistive_labels:
        return DWELL_BASE_S
    costs = sorted((DWELL_BY_LABEL.get(l, DWELL_BASE_S) for l in assistive_labels), reverse=True)
    return costs[0] + sum(c // 3 for c in costs[1:])
