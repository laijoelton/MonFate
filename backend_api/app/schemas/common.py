from enum import Enum

from pydantic import BaseModel, Field


class AccessibilityFeature(str, Enum):
    """Accessibility categories a rider can filter on and an obstacle can affect."""

    WHEELCHAIR_RAMP = "wheelchair_ramp"
    TACTILE_PAVING = "tactile_paving"
    WORKING_ELEVATOR = "working_elevator"
    STROLLER_FRIENDLY = "stroller_friendly"


class Coordinates(BaseModel):
    """WGS84 latitude/longitude pair used across every geolocated contract."""

    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
