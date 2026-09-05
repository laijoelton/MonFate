from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class ReportSignal(str, Enum):
    """Source of a single corroborating signal feeding a trust consensus."""

    RIDER_REPORT = "rider_report"
    CV_DETECTION = "cv_detection"
    OPERATOR_CONFIRMATION = "operator_confirmation"
    AUTO_EXPIRY = "auto_expiry"


class TrustConsensus(BaseModel):
    """
    Aggregated trust score backing an ObstacleReport.

    Combines corroborating signal count, reporter diversity, and recency
    decay into a single 0-100 score, e.g. surfaced to riders as
    "Verified 12m ago * 94% Trust Score".
    """

    obstacle_id: str
    score: float = Field(..., ge=0, le=100)
    signal_count: int = Field(..., ge=0)
    distinct_reporter_count: int = Field(..., ge=0)
    last_signal: ReportSignal
    last_verified_at: datetime
    decay_half_life_minutes: float = Field(
        default=180.0,
        gt=0,
        description="Minutes for score contribution from a single signal to halve.",
    )
