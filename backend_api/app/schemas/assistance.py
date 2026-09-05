"""Citizen assistance request contracts."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class AssistanceRequestStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class AssistanceRequestCreate(BaseModel):
    passenger_need: str = Field(..., min_length=2, max_length=200)
    stop_id: str = Field(..., min_length=1, max_length=64)
    bus_id: str | None = Field(default=None, max_length=64)
    client_request_id: str | None = Field(
        default=None,
        min_length=8,
        max_length=64,
        description="Anonymous idempotency key generated in the browser.",
    )


class AssistanceRequest(BaseModel):
    id: str
    passenger_need: str
    stop_id: str
    bus_id: str | None
    status: AssistanceRequestStatus
    timestamp: datetime


class AssistanceRequestAck(BaseModel):
    status: str
    assistance_request: AssistanceRequest
    created: bool
