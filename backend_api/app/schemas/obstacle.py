from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

from app.schemas.common import AccessibilityFeature, Coordinates


class ObstacleType(str, Enum):
    BLOCKED_RAMP = "blocked_ramp"
    ELEVATOR_OUTAGE = "elevator_outage"
    MISSING_TACTILE_PAVING = "missing_tactile_paving"
    CONSTRUCTION = "construction"
    SIDEWALK_OBSTRUCTION = "sidewalk_obstruction"
    OTHER = "other"


class ObstacleStatus(str, Enum):
    ACTIVE = "active"
    RESOLVED = "resolved"
    DISPUTED = "disputed"


class ObstacleReport(BaseModel):
    """A crowd-sourced or CV-detected obstacle affecting accessible routing."""

    id: str
    obstacle_type: ObstacleType
    location: Coordinates
    description: str = Field(..., max_length=500)
    affects: list[AccessibilityFeature] = Field(
        default_factory=list,
        description="Accessibility categories this obstacle blocks or degrades.",
    )
    status: ObstacleStatus = ObstacleStatus.ACTIVE
    trust_score: float = Field(..., ge=0, le=100)
    verification_count: int = Field(default=0, ge=0)
    reported_at: datetime
    last_verified_at: datetime
    reported_by: str | None = Field(
        default=None, description="Opaque reporter id; None for CV-only detections."
    )
