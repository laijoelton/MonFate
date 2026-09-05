"""SQLAlchemy tables backing the MonFate contracts.

Mirrors the Pydantic contracts in `app/schemas/` — see AGENTS.md guardrail #4:
the schemas are the source of truth, these are their persistence shape.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, Index, Integer, String

from .database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ObstacleRecord(Base):
    """A crowd-sourced or CV-detected accessibility obstacle."""

    __tablename__ = "obstacles"

    id = Column(String(64), primary_key=True)
    obstacle_type = Column(String(40), nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    description = Column(String(500), nullable=False, default="")
    # comma-separated AccessibilityFeature values; small fixed vocabulary, and
    # SQLite has no array type — the CRUD layer splits/joins it.
    affects = Column(String(200), nullable=False, default="")
    status = Column(String(20), nullable=False, default="active")
    trust_score = Column(Float, nullable=False, default=0.0)
    verification_count = Column(Integer, nullable=False, default=0)
    reported_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
    last_verified_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
    reported_by = Column(String(64), nullable=True)


class VehicleRecord(Base):
    """Latest known telemetry for one transit vehicle."""

    __tablename__ = "vehicles"

    vehicle_id = Column(String(64), primary_key=True)
    route_id = Column(String(120), nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    heading_degrees = Column(Float, nullable=False, default=0.0)
    speed_kmh = Column(Float, nullable=False, default=0.0)
    is_accessible = Column(Boolean, nullable=False, default=True)
    ramp_status = Column(String(20), nullable=False, default="stowed")
    capacity_status = Column(String(20), nullable=False, default="seats_available")
    next_stop_id = Column(String(64), nullable=False, default="")
    eta_seconds = Column(Integer, nullable=False, default=0)
    last_updated_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)


class VisionEventRecord(Base):
    """One accepted, image-free detection from a station CCTV edge node.

    `event_id` is the edge node's idempotency key: a retried POST after a flaky
    link must not double-count as a second passenger waiting.
    """

    __tablename__ = "vision_events"

    event_id = Column(String(64), primary_key=True)
    stop_id = Column(String(64), nullable=False, index=True)
    label = Column(String(40), nullable=False)
    confidence = Column(Float, nullable=True)
    object_count = Column(Integer, nullable=False, default=1)
    inference_ms = Column(Integer, nullable=False, default=0)
    model_version = Column(String(80), nullable=False, default="unknown")
    is_simulation = Column(Boolean, nullable=False, default=False)
    observed_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
    ingested_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)


Index("ix_vision_events_stop_observed", VisionEventRecord.stop_id, VisionEventRecord.observed_at)
Index("ix_obstacles_status", ObstacleRecord.status)


class AssistanceRequestRecord(Base):
    """Anonymous, explicitly confirmed boarding-assistance request."""

    __tablename__ = "assistance_requests"

    id = Column(String(64), primary_key=True)
    client_request_id = Column(String(64), unique=True, nullable=True, index=True)
    passenger_need = Column(String(200), nullable=False)
    stop_id = Column(String(64), nullable=False, index=True)
    bus_id = Column(String(64), nullable=True)
    status = Column(String(20), nullable=False, default="pending")
    timestamp = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
