from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.rtos_simulator import rtos_simulator

router = APIRouter(
    prefix="/api/v1/visual-assistance",
    tags=["visual-assistance"],
)


class Preferences(BaseModel):
    button_voice: bool = True
    voice_navigation: bool = True
    vibration_alerts: bool = True


class Feedback(BaseModel):
    # Always display text, even when speech is disabled.
    text: str
    speech: str | None = None
    vibration_ms: list[int] = Field(default_factory=list)
    simulated: bool = True


# 1. BUTTON PRESS VOICE FEEDBACK
# Uses your existing assistance simulator.
@router.post("/request-assistance", response_model=Feedback)
def request_assistance(preferences: Preferences):
    # If queuing fails, FastAPI returns an error, not a success message.
    rtos_simulator.add_assistance_task()

    message = "Demo assistance request queued."
    return Feedback(
        text=message,
        speech=message if preferences.button_voice else None,
    )


# 2. SPOKEN JOURNEY DIRECTIONS
# This is a scripted demonstration, not GPS navigation.
DEMO_STEPS = [
    "Walk straight for 30 metres.",
    "Turn left.",
    "Bus stop ahead.",
]


class NavigationRequest(BaseModel):
    step: int = Field(ge=0, lt=len(DEMO_STEPS))
    preferences: Preferences = Field(default_factory=Preferences)


@router.post("/demo/navigation", response_model=Feedback)
def navigation(request: NavigationRequest):
    message = DEMO_STEPS[request.step]

    return Feedback(
        text=message,
        speech=(
            message
            if request.preferences.voice_navigation
            else None
        ),
    )


# 3. VIBRATION ALERTS
class AlertRequest(BaseModel):
    event: Literal["bus_approaching", "destination_approaching"]
    preferences: Preferences = Field(default_factory=Preferences)


ALERTS = {
    # Vibrate 200ms, pause 150ms, vibrate 200ms.
    "bus_approaching": (
        "Your bus is approaching.",
        [200, 150, 200],
    ),
    # One longer vibration.
    "destination_approaching": (
        "Your destination is approaching.",
        [700],
    ),
}


@router.post("/demo/alerts", response_model=Feedback)
def journey_alert(request: AlertRequest):
    message, pattern = ALERTS[request.event]

    return Feedback(
        text=message,
        speech=(
            message
            if request.preferences.voice_navigation
            else None
        ),
        vibration_ms=(
            pattern
            if request.preferences.vibration_alerts
            else []
        ),
    )