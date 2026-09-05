"""Standalone transit simulation — lets backend_api run with zero hardware.

Enabled by SYS_MOCK_DATA=true. Drives vehicles along the demo corridor and
periodically fires a synthetic CCTV detection, both through the same crud +
stream path a real ingest takes, so the cockpit, WebSocket, and query endpoints
all work offline.
"""

from __future__ import annotations

import asyncio
import random
import uuid
from datetime import datetime, timezone

from app import crud
from app.config import get_settings
from app.database import SessionLocal
from app.schemas.common import Coordinates
from app.schemas.ingest import VehicleTelemetryPayload, VisionEventPayload
from app.schemas.vehicle import CapacityStatus, RampStatus
from app.services.spatial import bearing_degrees, eta_seconds, haversine_m
from app.stops import STOP_ORDER, location_of, next_stop
from app.stream import hub

settings = get_settings()

ROUTE_NAMES = ["Route 14 - Downtown Loop", "Route 22 - Riverside", "Route 8 - Hospital Link"]
ASSISTIVE_LABELS = ["wheelchair", "stroller", "mobility_aid"]


class _Vehicle:
    """A simulated vehicle walking the corridor stop to stop."""

    def __init__(self, index: int) -> None:
        self.vehicle_id = f"bus-{index + 1:02d}"
        self.route_id = ROUTE_NAMES[index % len(ROUTE_NAMES)]
        self.target = STOP_ORDER[index % len(STOP_ORDER)]
        start = location_of(STOP_ORDER[(index + len(STOP_ORDER) - 1) % len(STOP_ORDER)])
        self.location = Coordinates(lat=start.lat, lng=start.lng)
        self.speed_kmh = random.uniform(18, 32)
        self.is_accessible = index != 2  # one non-accessible vehicle in the fleet
        self.ramp_status = RampStatus.STOWED if self.is_accessible else RampStatus.NOT_EQUIPPED

    def step(self, dt_s: float) -> None:
        dest = location_of(self.target)
        if dest is None:
            return
        distance = haversine_m(self.location, dest)
        travel_m = self.speed_kmh * 1000.0 / 3600.0 * dt_s

        if distance <= travel_m or distance < 15.0:
            # Arrived: dwell briefly with the ramp out, then head for the next stop.
            self.location = Coordinates(lat=dest.lat, lng=dest.lng)
            self.target = next_stop(self.target)
            self.speed_kmh = random.uniform(18, 32)
            if self.is_accessible:
                self.ramp_status = RampStatus.DEPLOYED
            return

        if self.ramp_status == RampStatus.DEPLOYED:
            self.ramp_status = RampStatus.STOWED

        frac = travel_m / distance
        self.location = Coordinates(
            lat=self.location.lat + (dest.lat - self.location.lat) * frac,
            lng=self.location.lng + (dest.lng - self.location.lng) * frac,
        )

    def payload(self) -> VehicleTelemetryPayload:
        dest = location_of(self.target)
        distance = haversine_m(self.location, dest) if dest else 0.0
        return VehicleTelemetryPayload(
            vehicle_id=self.vehicle_id,
            route_id=self.route_id,
            location=self.location,
            heading_degrees=bearing_degrees(self.location, dest) if dest else 0.0,
            speed_kmh=round(self.speed_kmh, 1),
            is_accessible=self.is_accessible,
            ramp_status=self.ramp_status,
            capacity_status=random.choice(
                [CapacityStatus.SEATS_AVAILABLE, CapacityStatus.SEATS_AVAILABLE, CapacityStatus.STANDING_ROOM]
            ),
            next_stop_id=self.target,
            eta_seconds=eta_seconds(distance, self.speed_kmh),
        )


async def _run() -> None:
    fleet = [_Vehicle(i) for i in range(settings.MOCK_VEHICLES)]
    tick = 0
    while True:
        tick += 1
        for v in fleet:
            v.step(settings.MOCK_INTERVAL_S)
            db = SessionLocal()
            try:
                vehicle = crud.upsert_vehicle(db, v.payload())
            finally:
                db.close()
            await hub.broadcast("vehicle", vehicle.model_dump(mode="json"))

        # Every ~8 ticks a station node reports an assistive passenger waiting.
        if tick % 8 == 0:
            stop_id = random.choice(STOP_ORDER)
            label = ASSISTIVE_LABELS[(tick // 8) % len(ASSISTIVE_LABELS)]
            payload = VisionEventPayload(
                schema_version=1,
                event_id=str(uuid.uuid4()),
                device_id=stop_id,
                observed_at=datetime.now(timezone.utc),
                model_version="monfate-accessibility-v0-mock",
                label=label,
                confidence=round(random.uniform(0.74, 0.97), 3),
                object_count=1,
                inference_ms=random.randint(6, 18),
                bbox_xyxy=(180.0, 120.0, 340.0, 300.0),
                is_simulation=True,
            )
            from app.pipeline import handle_vision_event

            db = SessionLocal()
            try:
                await handle_vision_event(db, payload)
            finally:
                db.close()

        await asyncio.sleep(settings.MOCK_INTERVAL_S)


def start(app) -> None:
    app.state.mock_task = asyncio.create_task(_run())


async def stop(app) -> None:
    task = getattr(app.state, "mock_task", None)
    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
