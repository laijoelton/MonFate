"""Shared vision-event handling.

Both the HTTP ingest endpoint and the offline simulator funnel through here, so
a simulated detection exercises exactly the path a real station node takes —
persist, evaluate for dispatch, broadcast. No second code path to drift.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app import crud
from app.schemas.dispatch import DispatchAlert
from app.schemas.ingest import VisionEventPayload
from app.services import dispatch
from app.stops import location_of
from app.stream import hub


async def handle_vision_event(
    db: Session, payload: VisionEventPayload
) -> tuple[bool, DispatchAlert | None]:
    """Persist a detection and raise any dispatch alert it justifies.

    Returns (created, alert). `created` is False for a replayed event_id — a
    retried POST must not raise a second alert for the same passenger.
    """
    _row, created = crud.create_vision_event(db, payload)
    if not created:
        return False, None

    await hub.broadcast("vision", payload.model_dump(mode="json"))

    stop_id = payload.device_id
    stop_location = location_of(stop_id)
    vehicles = crud.list_vehicles(db)
    vehicle = dispatch.approaching_vehicle(vehicles, stop_id, stop_location)

    alert = dispatch.boarding_alert(
        stop_id=stop_id,
        label=payload.label,
        confidence=payload.confidence,
        observed_at=payload.observed_at,
        vehicle=vehicle,
    )

    # A blocked ramp landing zone outranks the boarding request: the bus can
    # arrive on time and still be unable to deploy its ramp.
    if stop_location is not None:
        blocked = dispatch.approach_alert(
            stop_id=stop_id,
            stop_location=stop_location,
            obstacles=crud.list_obstacles(db),
            vehicle=vehicle,
        )
        if blocked is not None:
            alert = blocked

    if alert is not None:
        await hub.broadcast("alert", alert.model_dump(mode="json"))
    return True, alert
