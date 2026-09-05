"""Pre-emptive dispatch alerts — the output of the predictive layer.

A dispatch alert is the product's whole point: warn *before* the rider is
stranded. Two things can raise one, and they are kept distinct because they
carry different operator actions.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

from app.schemas.common import AccessibilityFeature


class AlertKind(str, Enum):
    #: Station CCTV saw an assistive-mobility passenger waiting at an upcoming stop.
    ASSISTIVE_BOARDING = "assistive_boarding"
    #: A trusted obstacle blocks the vehicle's ramp landing zone / approach path.
    APPROACH_BLOCKED = "approach_blocked"


class AlertSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class DispatchAlert(BaseModel):
    """A pre-emptive alert routed to an approaching vehicle and the rider HUD."""

    alert_id: str
    kind: AlertKind
    severity: AlertSeverity
    stop_id: str
    vehicle_id: str | None = Field(
        default=None, description="Approaching vehicle this was dispatched to, if any."
    )
    route_id: str | None = None
    headline: str = Field(..., max_length=160)
    detail: str = Field(default="", max_length=500)
    #: For ASSISTIVE_BOARDING: the detected class. For APPROACH_BLOCKED: the blocked features.
    detected_label: str | None = None
    affects: list[AccessibilityFeature] = Field(default_factory=list)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    eta_seconds: int | None = Field(default=None, ge=0)
    raised_at: datetime
    #: Obstacle that triggered an APPROACH_BLOCKED alert.
    obstacle_id: str | None = None
