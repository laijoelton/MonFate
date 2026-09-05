"""Public citizen chat contract; session IDs are opaque, not authentication."""
from pydantic import BaseModel, ConfigDict, Field


class CitizenChatRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    message: str = Field(min_length=1, max_length=2000)
    session_id: str = Field(min_length=1, max_length=128)


class CitizenChatResponse(BaseModel):
    reply: str
