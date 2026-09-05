"""Grounded streaming citizen chat. Providers can propose, never execute, writes."""

from __future__ import annotations

import asyncio
import json
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from typing import Any

from pydantic import TypeAdapter, ValidationError

from app.config import get_settings
from app.schemas.chat import ChatActionProposal, ChatMessage

settings = get_settings()
proposal_adapter = TypeAdapter(ChatActionProposal)

SYSTEM_PROMPT = """You are the SampAI transit assistant. Reply concisely in English using
only the supplied transit snapshot. Explicitly label simulated information and admit when
data is unavailable. Never infer disability, age, pregnancy, medical conditions, or identity.
Ask for both a stop and an accessibility need before proposing assistance. Never claim an
action succeeded: tools only create proposals which the rider must confirm. Emergency
assistance is not a replacement for local emergency services."""

TOOLS = [
    {"type": "function", "function": {"name": "propose_assistance_request",
     "description": "Propose boarding help after the rider supplied a stop and need.",
     "parameters": {"type": "object", "properties": {
         "passenger_need": {"type": "string"}, "stop_id": {"type": "string"},
         "bus_id": {"type": ["string", "null"]}},
         "required": ["passenger_need", "stop_id"]}}},
    {"type": "function", "function": {"name": "propose_obstacle_report",
     "description": "Propose an accessibility obstacle report at a known stop.",
     "parameters": {"type": "object", "properties": {
         "obstacle_type": {"type": "string", "enum": ["blocked_ramp", "elevator_outage",
             "missing_tactile_paving", "construction", "sidewalk_obstruction", "other"]},
         "stop_id": {"type": "string"}, "description": {"type": "string"},
         "affects": {"type": "array", "items": {"type": "string", "enum": [
             "wheelchair_ramp", "tactile_paving", "working_elevator", "stroller_friendly"]}}},
         "required": ["obstacle_type", "stop_id", "description", "affects"]}}},
]


class ChatProvider(ABC):
    @abstractmethod
    async def stream(self, messages: list[ChatMessage], context: dict[str, Any]) -> AsyncIterator[dict]:
        raise NotImplementedError


async def _word_stream(text: str) -> AsyncIterator[dict]:
    for word in text.split(" "):
        yield {"event": "text_delta", "data": {"text": word + " "}}
        await asyncio.sleep(0.035)


class MockChatProvider(ChatProvider):
    async def stream(self, messages: list[ChatMessage], context: dict[str, Any]) -> AsyncIterator[dict]:
        prompt = messages[-1].content.lower()
        conversation = " ".join(message.content.lower() for message in messages[-4:])
        stops, vehicles = context["stops"], context["vehicles"]
        prefix = "Simulated data: " if context["simulated"] else "Live data: "
        named_stop = next((s for s in stops if s["name"].lower() in conversation), None)
        proposal = None

        if "wheelchair" in conversation and "assistance" in conversation:
            if not named_stop:
                reply = "Which stop should the wheelchair boarding assistance be arranged at?"
            else:
                bus = min((v for v in vehicles if v.get("is_accessible")),
                          key=lambda v: v.get("eta_seconds", 10**9), default=None)
                proposal = {"action": "assistance_request",
                            "passenger_need": "Wheelchair boarding assistance",
                            "stop_id": named_stop["stop_id"],
                            "bus_id": bus.get("vehicle_id") if bus else None}
                reply = (f"{prefix}I prepared boarding assistance at {named_stop['name']}. "
                         "Nothing has been submitted yet; review it and select Confirm.")
        elif ("lift" in conversation or "elevator" in conversation) and (
            "broken" in conversation or "out" in conversation
        ):
            if not named_stop:
                reply = "Which stop has the broken lift?"
            else:
                proposal = {"action": "obstacle_report", "obstacle_type": "elevator_outage",
                            "stop_id": named_stop["stop_id"],
                            "description": f"Lift reported broken at {named_stop['name']}.",
                            "affects": ["working_elevator"]}
                reply = (f"{prefix}I prepared a lift-outage report for {named_stop['name']}. "
                         "Nothing has been submitted yet; review it and select Confirm.")
        elif "crowd" in prompt:
            reply = (f"{prefix}" + ", ".join(
                f"{v['vehicle_id']} is {str(v.get('capacity_status', 'unknown')).replace('_', ' ')}"
                for v in vehicles[:3]) + ".") if vehicles else "Crowd information is unavailable."
        elif "accessible bus" in prompt or "arriving next" in prompt:
            bus = min((v for v in vehicles if v.get("is_accessible") and v.get("ramp_status") != "fault"),
                      key=lambda v: v.get("eta_seconds", 10**9), default=None)
            if bus:
                mins = max(1, round(bus.get("eta_seconds", 0) / 60))
                stop_name = next((s["name"] for s in stops if s["stop_id"] == bus.get("next_stop_id")),
                                 bus.get("next_stop_id", "the next stop"))
                reply = (f"{prefix}{bus['vehicle_id']} on {bus['route_id']} is next, about {mins} "
                         f"minute{'s' if mins != 1 else ''} from {stop_name}. Ramp: {bus.get('ramp_status')}.")
            else:
                reply = "No accessible bus with a working ramp is currently available."
        elif "route" in prompt:
            reply = "Tell me your starting stop, destination, and accessibility need."
        else:
            reply = ("I can help with accessible buses, ETAs, crowd levels, routes, boarding "
                     "assistance, and obstacle reports. What would you like to know?")

        async for event in _word_stream(reply):
            yield event
        if proposal:
            yield {"event": "action_proposal", "data": {"proposal": proposal}}


class DeepSeekChatProvider(ChatProvider):
    async def stream(self, messages: list[ChatMessage], context: dict[str, Any]) -> AsyncIterator[dict]:
        if not settings.DEEPSEEK_API_KEY:
            raise RuntimeError("DeepSeek is not configured. Add DEEPSEEK_API_KEY on the backend.")
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.DEEPSEEK_API_KEY,
                             base_url="https://api.deepseek.com", timeout=25.0)
        stream = await client.chat.completions.create(
            model=settings.DEEPSEEK_MODEL,
            messages=[{"role": "system", "content": SYSTEM_PROMPT + "\nSnapshot:\n" + json.dumps(context)},
                      *[m.model_dump() for m in messages]],
            tools=TOOLS, stream=True, extra_body={"thinking": {"type": "disabled"}},
        )
        calls: dict[int, dict[str, str]] = {}
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield {"event": "text_delta", "data": {"text": delta.content}}
            for call in delta.tool_calls or []:
                entry = calls.setdefault(call.index, {"name": "", "arguments": ""})
                if call.function and call.function.name:
                    entry["name"] += call.function.name
                if call.function and call.function.arguments:
                    entry["arguments"] += call.function.arguments
        for call in calls.values():
            try:
                args = json.loads(call["arguments"])
                args["action"] = ({"propose_assistance_request": "assistance_request",
                                   "propose_obstacle_report": "obstacle_report"})[call["name"]]
                proposal = proposal_adapter.validate_python(args)
                known_stops = {stop["stop_id"] for stop in context["stops"]}
                known_buses = {vehicle["vehicle_id"] for vehicle in context["vehicles"]}
                if proposal.stop_id not in known_stops:
                    raise ValueError("unknown stop")
                if (
                    proposal.action == "assistance_request"
                    and proposal.bus_id is not None
                    and proposal.bus_id not in known_buses
                ):
                    raise ValueError("unknown bus")
            except (KeyError, json.JSONDecodeError, ValidationError, ValueError) as exc:
                raise RuntimeError("The proposed action was invalid. Please restate the details.") from exc
            yield {"event": "action_proposal", "data": {"proposal": proposal.model_dump(mode="json")}}


def get_chat_provider() -> ChatProvider:
    return DeepSeekChatProvider() if settings.CHAT_PROVIDER == "deepseek" else MockChatProvider()
