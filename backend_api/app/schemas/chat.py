"""Stateless chat transport and validated action proposal contracts."""

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field

from app.schemas.common import AccessibilityFeature
from app.schemas.obstacle import ObstacleType


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=800)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1, max_length=20)


class AssistanceActionProposal(BaseModel):
    action: Literal["assistance_request"] = "assistance_request"
    passenger_need: str = Field(..., min_length=2, max_length=200)
    stop_id: str = Field(..., min_length=1, max_length=64)
    bus_id: str | None = Field(default=None, max_length=64)


class ObstacleActionProposal(BaseModel):
    action: Literal["obstacle_report"] = "obstacle_report"
    obstacle_type: ObstacleType
    stop_id: str = Field(..., min_length=1, max_length=64)
    description: str = Field(..., min_length=2, max_length=500)
    affects: list[AccessibilityFeature] = Field(default_factory=list, max_length=4)


ChatActionProposal = Annotated[
    Union[AssistanceActionProposal, ObstacleActionProposal], Field(discriminator="action")
]
