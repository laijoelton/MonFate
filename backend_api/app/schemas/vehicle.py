from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

from app.schemas.common import Coordinates


class RampStatus(str, Enum):
    STOWED = "stowed"
    DEPLOYED = "deployed"
    FAULT = "fault"
    NOT_EQUIPPED = "not_equipped"


class CapacityStatus(str, Enum):
    EMPTY = "empty"
    SEATS_AVAILABLE = "seats_available"
    STANDING_ROOM = "standing_room"
    FULL = "full"


class TransitVehicle(BaseModel):
    """Live telemetry for a transit vehicle relevant to accessible routing."""

    vehicle_id: str
    route_id: str
    location: Coordinates
    heading_degrees: float = Field(..., ge=0, lt=360)
    speed_kmh: float = Field(..., ge=0)
    is_accessible: bool = Field(
        ..., description="Whether the vehicle has a functioning ramp/lift."
    )
    ramp_status: RampStatus
    capacity_status: CapacityStatus
    next_stop_id: str
    eta_seconds: int = Field(..., ge=0)
    last_updated_at: datetime
