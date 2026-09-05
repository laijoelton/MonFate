"""Pre-emptive dispatch engine.

Decides when a vehicle should be warned before it arrives. Two triggers, both
required by the product: a passenger needing assistance is waiting at an
upcoming stop, or a trusted obstacle blocks the ramp landing zone there.

The engine only raises alerts — it never mutates vehicle state. The operator
(or the vehicle) decides what to do, which keeps a mis-detection from silently
rerouting a bus.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from app.config import get_settings
from app.schemas.common import AccessibilityFeature, Coordinates
from app.schemas.dispatch import AlertKind, AlertSeverity, DispatchAlert
from app.schemas.obstacle import ObstacleReport
from app.schemas.vehicle import TransitVehicle
from app.services import trust
from app.services.spatial import haversine_m

settings = get_settings()

#: A boarding request older than this is assumed served or abandoned.
BOARDING_TTL = timedelta(minutes=8)

#: How close an obstacle must be to a stop to count as blocking its approach.
APPROACH_RADIUS_M = 60.0

LABEL_TO_FEATURE: dict[str, AccessibilityFeature] = {
    "wheelchair": AccessibilityFeature.WHEELCHAIR_RAMP,
    "stroller": AccessibilityFeature.STROLLER_FRIENDLY,
    "mobility_aid": AccessibilityFeature.WHEELCHAIR_RAMP,
}

_HEADLINE = {
    "wheelchair": "Wheelchair boarding requested",
    "stroller": "Stroller boarding requested",
    "mobility_aid": "Mobility-aid boarding requested",
}


def approaching_vehicle(
    vehicles: list[TransitVehicle], stop_id: str, stop_location: Coordinates | None
) -> TransitVehicle | None:
    """The nearest accessible vehicle inbound to `stop_id` within the ETA window.

    Only accessible vehicles are candidates: alerting a bus with no working ramp
    that a wheelchair user is waiting tells the driver something they cannot act
    on, and would let the system report a "handled" boarding that never happens.
    """
    candidates = [
        v
        for v in vehicles
        if v.is_accessible
        and v.ramp_status != "not_equipped"
        and v.next_stop_id == stop_id
        and v.eta_seconds <= settings.DISPATCH_ETA_WINDOW_S
    ]
    if not candidates:
        return None
    if stop_location is not None:
        return min(candidates, key=lambda v: haversine_m(v.location, stop_location))
    return min(candidates, key=lambda v: v.eta_seconds)


def boarding_alert(
    *,
    stop_id: str,
    label: str,
    confidence: float | None,
    observed_at: datetime,
    vehicle: TransitVehicle | None,
    now: datetime | None = None,
) -> DispatchAlert | None:
    """Raise an ASSISTIVE_BOARDING alert, or None if it should not fire."""
    now = now or datetime.now(timezone.utc)
    if label not in LABEL_TO_FEATURE:
        return None  # `ambulant` / `other` are never a dispatch signal
    if _as_utc(now) - _as_utc(observed_at) > BOARDING_TTL:
        return None

    return DispatchAlert(
        alert_id=f"alert-{uuid.uuid4().hex[:10]}",
        kind=AlertKind.ASSISTIVE_BOARDING,
        severity=AlertSeverity.WARNING if vehicle else AlertSeverity.INFO,
        stop_id=stop_id,
        vehicle_id=vehicle.vehicle_id if vehicle else None,
        route_id=vehicle.route_id if vehicle else None,
        headline=_HEADLINE.get(label, "Assistive boarding requested"),
        detail=(
            f"Detected at {stop_id} by station CCTV."
            if vehicle
            else f"Detected at {stop_id}. No accessible vehicle inbound within the alert window."
        ),
        detected_label=label,
        affects=[LABEL_TO_FEATURE[label]],
        confidence=confidence,
        eta_seconds=vehicle.eta_seconds if vehicle else None,
        raised_at=now,
    )


def approach_alert(
    *,
    stop_id: str,
    stop_location: Coordinates,
    obstacles: list[ObstacleReport],
    vehicle: TransitVehicle | None,
    now: datetime | None = None,
) -> DispatchAlert | None:
    """Raise an APPROACH_BLOCKED alert for the most trusted blocking obstacle."""
    now = now or datetime.now(timezone.utc)
    blocking = [
        o
        for o in obstacles
        if o.status == "active"
        and trust.is_actionable(o.trust_score)
        and haversine_m(o.location, stop_location) <= APPROACH_RADIUS_M
    ]
    if not blocking:
        return None

    worst = max(blocking, key=lambda o: o.trust_score)
    return DispatchAlert(
        alert_id=f"alert-{uuid.uuid4().hex[:10]}",
        kind=AlertKind.APPROACH_BLOCKED,
        severity=AlertSeverity.CRITICAL,
        stop_id=stop_id,
        vehicle_id=vehicle.vehicle_id if vehicle else None,
        route_id=vehicle.route_id if vehicle else None,
        headline="Ramp landing zone blocked",
        detail=worst.description,
        affects=worst.affects,
        confidence=round(worst.trust_score / 100.0, 3),
        eta_seconds=vehicle.eta_seconds if vehicle else None,
        raised_at=now,
        obstacle_id=worst.id,
    )


def _as_utc(ts: datetime) -> datetime:
    return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
