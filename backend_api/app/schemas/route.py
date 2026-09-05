from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import AccessibilityFeature, Coordinates


class AccessibilityRoute(BaseModel):
    """A routed path scored and annotated by live accessibility state."""

    route_id: str
    origin: Coordinates
    destination: Coordinates
    waypoints: list[Coordinates] = Field(default_factory=list)
    accessibility_score: float = Field(..., ge=0, le=100)
    active_obstacle_ids: list[str] = Field(
        default_factory=list,
        description="ObstacleReport.id values currently affecting this route.",
    )
    required_features: list[AccessibilityFeature] = Field(
        default_factory=list,
        description="Accessibility filters the rider requested for this route.",
    )
    estimated_duration_seconds: int = Field(..., ge=0)
    computed_at: datetime
