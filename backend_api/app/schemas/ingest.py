"""Wire payloads for the ingestion endpoints.

These are the shapes edge nodes and vehicles POST. They are deliberately
separate from the read contracts in `obstacle.py` / `vehicle.py`: a station node
reports what it saw, and the backend — not the node — decides the trust score,
the status, and whether anything gets dispatched.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import AccessibilityFeature, Coordinates
from app.schemas.obstacle import ObstacleReport, ObstacleType
from app.schemas.vehicle import CapacityStatus, RampStatus, TransitVehicle

SCHEMA_VERSION = 1


class VisionEventPayload(BaseModel):
    """An accepted, image-free detection from a station CCTV edge node.

    Mirrors `edge_vision.emitter.DetectionEvent` exactly — that dataclass is the
    producer, this is the consumer. Changing one without the other breaks ingest.
    """

    schema_version: int = Field(..., ge=1, le=SCHEMA_VERSION)
    event_id: str = Field(..., min_length=1, max_length=64)
    device_id: str = Field(..., min_length=1, max_length=64, description="Station/stop id.")
    observed_at: datetime
    model_version: str = Field(..., min_length=1, max_length=80)
    label: str = Field(..., min_length=1, max_length=40)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    object_count: int = Field(..., ge=0)
    inference_ms: int = Field(..., ge=0)
    bbox_xyxy: tuple[float, float, float, float] | None = None
    is_simulation: bool = False
    t_capture_ns: int | None = None
    t_infer_ns: int | None = None


class VehicleTelemetryPayload(BaseModel):
    """A position/status update from a transit vehicle."""

    vehicle_id: str = Field(..., min_length=1, max_length=64)
    route_id: str = Field(..., min_length=1, max_length=120)
    location: Coordinates
    heading_degrees: float = Field(default=0.0, ge=0, lt=360)
    speed_kmh: float = Field(default=0.0, ge=0)
    is_accessible: bool = True
    ramp_status: RampStatus = RampStatus.STOWED
    capacity_status: CapacityStatus = CapacityStatus.SEATS_AVAILABLE
    next_stop_id: str = Field(default="", max_length=64)
    eta_seconds: int = Field(default=0, ge=0)


class ObstacleReportCreate(BaseModel):
    """A rider-submitted obstacle report. Trust score is assigned server-side."""

    obstacle_type: ObstacleType
    location: Coordinates
    description: str = Field(..., min_length=1, max_length=500)
    affects: list[AccessibilityFeature] = Field(default_factory=list)
    reported_by: str | None = Field(default=None, max_length=64)


class VisionEventAck(BaseModel):
    status: str
    event_id: str


class TelemetryAck(BaseModel):
    status: str
    vehicle: TransitVehicle


class ObstacleAck(BaseModel):
    status: str
    obstacle: ObstacleReport


class HealthOut(BaseModel):
    status: str
    mock_data: bool
