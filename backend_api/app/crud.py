"""Persistence helpers. Converts between SQLAlchemy rows and the Pydantic contracts."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import ObstacleRecord, VehicleRecord, VisionEventRecord
from app.schemas.common import AccessibilityFeature, Coordinates
from app.schemas.ingest import ObstacleReportCreate, VehicleTelemetryPayload, VisionEventPayload
from app.schemas.obstacle import ObstacleReport
from app.schemas.trust import ReportSignal
from app.schemas.vehicle import TransitVehicle
from app.services import trust


# --- obstacles --------------------------------------------------------------

def create_obstacle(db: Session, payload: ObstacleReportCreate) -> ObstacleReport:
    now = datetime.now(timezone.utc)
    row = ObstacleRecord(
        id=f"obs-{uuid.uuid4().hex[:10]}",
        obstacle_type=payload.obstacle_type.value,
        lat=payload.location.lat,
        lng=payload.location.lng,
        description=payload.description,
        affects=",".join(f.value for f in payload.affects),
        status="active",
        trust_score=trust.score(
            signals=[(ReportSignal.RIDER_REPORT, now)],
            distinct_reporters=1,
            now=now,
        ),
        verification_count=1,
        reported_at=now,
        last_verified_at=now,
        reported_by=payload.reported_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return to_obstacle(row)


def corroborate_obstacle(
    db: Session, obstacle_id: str, signal: ReportSignal
) -> ObstacleReport | None:
    """Add one confirming signal and rescore. Returns None if unknown."""
    row = db.get(ObstacleRecord, obstacle_id)
    if row is None:
        return None
    now = datetime.now(timezone.utc)
    row.verification_count += 1
    row.last_verified_at = now
    # Replay the accumulated signals as a single fresh batch: the row stores the
    # count, not the individual timestamps, so this approximates the history by
    # treating prior signals as having occurred at the previous confirmation.
    prior = _as_utc(row.reported_at)
    signals = [(ReportSignal.RIDER_REPORT, prior)] * max(row.verification_count - 1, 0)
    signals.append((signal, now))
    row.trust_score = trust.score(
        signals=signals,
        distinct_reporters=min(row.verification_count, 5),
        now=now,
    )
    db.commit()
    db.refresh(row)
    return to_obstacle(row)


def list_obstacles(db: Session, *, active_only: bool = True) -> list[ObstacleReport]:
    q = db.query(ObstacleRecord)
    if active_only:
        q = q.filter(ObstacleRecord.status == "active")
    return [to_obstacle(r) for r in q.all()]


def to_obstacle(row: ObstacleRecord) -> ObstacleReport:
    return ObstacleReport(
        id=row.id,
        obstacle_type=row.obstacle_type,
        location=Coordinates(lat=row.lat, lng=row.lng),
        description=row.description,
        affects=[AccessibilityFeature(f) for f in row.affects.split(",") if f],
        status=row.status,
        trust_score=row.trust_score,
        verification_count=row.verification_count,
        reported_at=_as_utc(row.reported_at),
        last_verified_at=_as_utc(row.last_verified_at),
        reported_by=row.reported_by,
    )


# --- vehicles ---------------------------------------------------------------

def upsert_vehicle(db: Session, payload: VehicleTelemetryPayload) -> TransitVehicle:
    row = db.get(VehicleRecord, payload.vehicle_id)
    if row is None:
        row = VehicleRecord(vehicle_id=payload.vehicle_id)
        db.add(row)
    row.route_id = payload.route_id
    row.lat = payload.location.lat
    row.lng = payload.location.lng
    row.heading_degrees = payload.heading_degrees
    row.speed_kmh = payload.speed_kmh
    row.is_accessible = payload.is_accessible
    row.ramp_status = payload.ramp_status.value
    row.capacity_status = payload.capacity_status.value
    row.next_stop_id = payload.next_stop_id
    row.eta_seconds = payload.eta_seconds
    row.last_updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return to_vehicle(row)


def list_vehicles(db: Session) -> list[TransitVehicle]:
    return [to_vehicle(r) for r in db.query(VehicleRecord).all()]


def to_vehicle(row: VehicleRecord) -> TransitVehicle:
    return TransitVehicle(
        vehicle_id=row.vehicle_id,
        route_id=row.route_id,
        location=Coordinates(lat=row.lat, lng=row.lng),
        heading_degrees=row.heading_degrees,
        speed_kmh=row.speed_kmh,
        is_accessible=row.is_accessible,
        ramp_status=row.ramp_status,
        capacity_status=row.capacity_status,
        next_stop_id=row.next_stop_id,
        eta_seconds=row.eta_seconds,
        last_updated_at=_as_utc(row.last_updated_at),
    )


# --- vision events ----------------------------------------------------------

def create_vision_event(db: Session, payload: VisionEventPayload) -> tuple[VisionEventRecord, bool]:
    """Insert one detection. Returns (row, created) — False when it's a replay."""
    existing = db.get(VisionEventRecord, payload.event_id)
    if existing is not None:
        return existing, False
    row = VisionEventRecord(
        event_id=payload.event_id,
        stop_id=payload.device_id,
        label=payload.label,
        confidence=payload.confidence,
        object_count=payload.object_count,
        inference_ms=payload.inference_ms,
        model_version=payload.model_version,
        is_simulation=payload.is_simulation,
        observed_at=payload.observed_at,
        ingested_at=datetime.now(timezone.utc),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row, True


def recent_vision_events(db: Session, stop_id: str, limit: int = 20) -> list[VisionEventRecord]:
    return (
        db.query(VisionEventRecord)
        .filter(VisionEventRecord.stop_id == stop_id)
        .order_by(VisionEventRecord.observed_at.desc())
        .limit(limit)
        .all()
    )


def _as_utc(ts: datetime) -> datetime:
    return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
