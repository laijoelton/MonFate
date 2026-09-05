"""Accessibility-first route optimisation for the Cyberjaya corridor.

Minimises total journey cost across four ingestion sources:

1. **Traffic density** per arterial corridor, scaling free-flow speed down.
2. **Community obstacle reports**, time-decayed and trust-weighted, so a stale
   or lightly-corroborated report cannot reroute a bus on its own.
3. **Edge vision payloads** — debounced ``wheelchair`` / ``stroller`` /
   ``mobility_aid`` tags behind a Protocol, so the vision model can be plugged
   in when its head is fine-tuned without touching this module.
4. **Station elderly/OKU concentration**, lengthening dwell and pre-dispatching
   the ramp where it matters.

The objective is deliberately *not* pure travel time. Arriving two minutes
earlier at a stop where the ramp then fails to deploy is not a faster journey
for the rider who needed the ramp — so predicted dwell is inside the cost
function, not bolted on after routing.
"""

from __future__ import annotations

import heapq
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Protocol, runtime_checkable

from core.geo import travel_seconds
from routing.cyberjaya_stations import (
    CORRIDORS,
    Station,
    corridor_distance_m,
    corridor_id,
    neighbours,
    station,
)

#: Free-flow speed by corridor key, built once from the registry.
_SPEED_BY_CORRIDOR: dict[str, float] = {
    corridor_id(a, b): speed for a, b, speed in CORRIDORS
}

#: Trust score at or above which an obstacle is allowed to influence routing.
#: Matches `backend_api/app/services/trust.TRUST_ACTIONABLE_SCORE`; a lone
#: uncorroborated report must never reroute a wheelchair user.
ACTIONABLE_TRUST = 70.0

#: Half-life for obstacle relevance. Mirrors the backend trust decay so a
#: report fades from routing at the same rate it fades from the rider's map.
OBSTACLE_HALF_LIFE_MIN = 180.0

#: Decayed weight below which a report stops influencing routing entirely.
#: Exponential decay only ever approaches zero, so without a floor an ancient
#: report keeps a small permanent vote — and against a 1800s block penalty even
#: a 4% weight is 67s, enough to flip a cheap detour. With the floor, a
#: high-trust report stops rerouting buses roughly 8h after its last
#: confirmation, on the assumption that an unconfirmed barrier has been cleared.
MIN_RELEVANCE_WEIGHT = 0.15

#: Seconds added per boarding, by detected class. A ramp cycle dominates.
VISION_TAG_DWELL_S: dict[str, int] = {
    "wheelchair": 65,
    "mobility_aid": 40,
    "stroller": 30,
}

#: A corridor blocked by a high-trust barrier costs this much extra. Large
#: enough to force a detour whenever one exists, finite so a rider is never
#: told "no route" when a slow path is available.
BLOCKED_CORRIDOR_PENALTY_S = 1_800.0


@runtime_checkable
class VisionFeed(Protocol):
    """Pluggable edge-vision source.

    The vision pipeline emits debounced, image-free tags; this is the seam it
    connects through once `edge_vision` has a fine-tuned mobility head.
    """

    def tags_at(self, station_id: str) -> list[str]:
        """Accepted detection labels currently waiting at a station."""
        ...


class NullVisionFeed:
    """No vision coverage. The optimizer falls back to demographics alone."""

    def tags_at(self, station_id: str) -> list[str]:
        return []


@dataclass
class StaticVisionFeed:
    """Fixed tags per station, for tests and offline demos."""

    tags: dict[str, list[str]] = field(default_factory=dict)

    def tags_at(self, station_id: str) -> list[str]:
        return list(self.tags.get(station_id, ()))


@dataclass(frozen=True)
class ObstacleReport:
    """A community-reported barrier on a corridor.

    Field names mirror `backend_api/app/schemas/obstacle.ObstacleReport` so the
    two do not drift; this carries only what routing needs.
    """

    obstacle_id: str
    corridor: str  # from corridor_id(a, b)
    description: str
    trust_score: float
    last_verified_at: datetime
    blocks_wheelchair: bool = True


@dataclass(frozen=True)
class TrafficReading:
    """Congestion on one corridor. 0.0 = free flow, 1.0 = gridlock."""

    corridor: str
    density: float

    def __post_init__(self) -> None:
        if not 0.0 <= self.density <= 1.0:
            raise ValueError(f"density must be 0-1, got {self.density}")


@dataclass(frozen=True)
class StopPlan:
    """Per-station dwell allocation on a planned route."""

    station_id: str
    name: str
    base_dwell_s: int
    demographic_buffer_s: int
    vision_buffer_s: int
    total_dwell_s: int
    ramp_predispatch: bool
    reasons: tuple[str, ...]


@dataclass(frozen=True)
class RoutePlan:
    """The optimiser's answer."""

    origin: str
    destination: str
    path: list[str]
    total_cost_s: float
    travel_s: float
    dwell_s: float
    obstacle_penalty_s: float
    stops: list[StopPlan]
    #: Corridors the obstacle-free route would have used but this one avoids.
    avoided_corridors: list[str]
    #: Reports still penalising the chosen path (a detour may not be free).
    obstacle_ids_on_path: list[str]
    ramp_dispatch_at: list[str]

    def to_dict(self) -> dict:
        return {
            "origin": self.origin,
            "destination": self.destination,
            "path": self.path,
            "total_cost_s": round(self.total_cost_s, 1),
            "travel_s": round(self.travel_s, 1),
            "dwell_s": round(self.dwell_s, 1),
            "obstacle_penalty_s": round(self.obstacle_penalty_s, 1),
            "ramp_dispatch_at": self.ramp_dispatch_at,
            "avoided_corridors": self.avoided_corridors,
            "obstacle_ids_on_path": self.obstacle_ids_on_path,
            "stops": [
                {
                    "station_id": s.station_id,
                    "total_dwell_s": s.total_dwell_s,
                    "ramp_predispatch": s.ramp_predispatch,
                    "reasons": list(s.reasons),
                }
                for s in self.stops
            ],
        }


def obstacle_weight(report: ObstacleReport, *, now: datetime | None = None) -> float:
    """Time-decayed, trust-gated influence of one report, in [0, 1].

    Below `ACTIONABLE_TRUST` the weight is zero — not merely small. A barrier
    nobody has corroborated should have no vote at all in where a bus goes.
    """
    if report.trust_score < ACTIONABLE_TRUST:
        return 0.0
    now = now or datetime.now(timezone.utc)
    verified = report.last_verified_at
    if verified.tzinfo is None:
        verified = verified.replace(tzinfo=timezone.utc)
    minutes = max(0.0, (now - verified).total_seconds() / 60.0)
    decay = 0.5 ** (minutes / OBSTACLE_HALF_LIFE_MIN)
    weight = (report.trust_score / 100.0) * decay
    return weight if weight >= MIN_RELEVANCE_WEIGHT else 0.0


def dwell_plan(
    st: Station,
    *,
    vision_tags: list[str] | None = None,
) -> StopPlan:
    """Predicted dwell at one station, and whether to pre-deploy the ramp."""
    tags = vision_tags or []
    reasons: list[str] = []

    # Demographic buffer: scales the base dwell by accessibility load.
    demographic_buffer = round(st.base_dwell_s * st.accessibility_load)
    if demographic_buffer:
        reasons.append(
            f"demographics: {st.elderly_pct:.1f}% elderly, {st.oku_pct:.1f}% OKU"
        )

    # Live vision: concurrent boardings overlap rather than queue end to end,
    # so take the slowest plus a share of each additional one.
    costs = sorted((VISION_TAG_DWELL_S.get(t, 0) for t in tags), reverse=True)
    vision_buffer = costs[0] + sum(c // 3 for c in costs[1:]) if costs else 0
    if vision_buffer:
        reasons.append(f"vision: {', '.join(sorted(tags))}")

    predispatch = st.needs_ramp_predispatch or any(
        t in ("wheelchair", "mobility_aid") for t in tags
    )
    if predispatch:
        reasons.append("ramp pre-dispatch on approach")

    return StopPlan(
        station_id=st.station_id,
        name=st.name,
        base_dwell_s=st.base_dwell_s,
        demographic_buffer_s=demographic_buffer,
        vision_buffer_s=vision_buffer,
        total_dwell_s=st.base_dwell_s + demographic_buffer + vision_buffer,
        ramp_predispatch=predispatch,
        reasons=tuple(reasons),
    )


class RouteOptimizer:
    """Multi-factor, accessibility-first shortest path over the corridor graph."""

    def __init__(
        self,
        *,
        traffic: dict[str, float] | None = None,
        obstacles: list[ObstacleReport] | None = None,
        vision: VisionFeed | None = None,
        now: datetime | None = None,
    ) -> None:
        self.traffic = traffic or {}
        self.obstacles = obstacles or []
        self.vision: VisionFeed = vision or NullVisionFeed()
        self.now = now or datetime.now(timezone.utc)

    # --- cost components --------------------------------------------------

    def corridor_travel_s(self, a: str, b: str, base_speed_kmh: float) -> float:
        """Travel time with congestion applied.

        Density scales speed down to 25% of free flow at full gridlock rather
        than to zero — a stationary bus would make the corridor cost infinite
        and silently disconnect the graph.
        """
        density = self.traffic.get(corridor_id(a, b), 0.0)
        effective_speed = base_speed_kmh * (1.0 - 0.75 * density)
        return travel_seconds(corridor_distance_m(a, b), effective_speed)

    def corridor_obstacle_penalty(self, a: str, b: str) -> tuple[float, list[str]]:
        """Penalty and the ids of reports that caused it."""
        cid = corridor_id(a, b)
        penalty = 0.0
        blocking: list[str] = []
        for report in self.obstacles:
            if report.corridor != cid:
                continue
            weight = obstacle_weight(report, now=self.now)
            if weight <= 0.0:
                continue
            penalty += BLOCKED_CORRIDOR_PENALTY_S * weight
            blocking.append(report.obstacle_id)
        return penalty, blocking

    def station_dwell(self, station_id: str) -> StopPlan:
        return dwell_plan(station(station_id), vision_tags=self.vision.tags_at(station_id))

    # --- search -----------------------------------------------------------

    def plan(self, origin: str, destination: str) -> RoutePlan:
        """Least-cost accessible route via Dijkstra over the combined cost."""
        station(origin), station(destination)  # validate both ids up front

        if origin == destination:
            stop = self.station_dwell(origin)
            return RoutePlan(
                origin=origin, destination=destination, path=[origin],
                total_cost_s=0.0, travel_s=0.0, dwell_s=0.0, obstacle_penalty_s=0.0,
                stops=[stop], avoided_corridors=[], obstacle_ids_on_path=[],
                ramp_dispatch_at=[origin] if stop.ramp_predispatch else [],
            )

        path = self._search(origin, destination, ignore_obstacles=False)

        # What the route would have been with no obstacle reports at all. The
        # difference is what the reports actually bought the rider — reported
        # rather than assumed, so a "detour" that changed nothing says so.
        if self.obstacles:
            baseline = self._search(origin, destination, ignore_obstacles=True)
            baseline_edges = {corridor_id(a, b) for a, b in zip(baseline, baseline[1:])}
            chosen_edges = {corridor_id(a, b) for a, b in zip(path, path[1:])}
            avoided = sorted(baseline_edges - chosen_edges)
        else:
            avoided = []

        return self._summarise(origin, destination, path, avoided)

    def _search(self, origin: str, destination: str, *, ignore_obstacles: bool) -> list[str]:
        best: dict[str, float] = {origin: 0.0}
        prev: dict[str, str] = {}
        # (cost, station_id) — station_id breaks ties so the heap never compares
        # dicts and the result is deterministic for equal-cost paths.
        heap: list[tuple[float, str]] = [(0.0, origin)]
        settled: set[str] = set()

        while heap:
            cost, current = heapq.heappop(heap)
            if current in settled:
                continue
            settled.add(current)
            if current == destination:
                break

            for neighbour, base_speed in neighbours(current):
                if neighbour in settled:
                    continue
                travel = self.corridor_travel_s(current, neighbour, base_speed)
                penalty = (
                    0.0 if ignore_obstacles
                    else self.corridor_obstacle_penalty(current, neighbour)[0]
                )
                # Dwell at the neighbour counts, except at the final destination
                # where the vehicle is not boarding onward passengers.
                dwell = 0.0 if neighbour == destination else self.station_dwell(neighbour).total_dwell_s
                candidate = cost + travel + penalty + dwell
                if candidate < best.get(neighbour, float("inf")):
                    best[neighbour] = candidate
                    prev[neighbour] = current
                    heapq.heappush(heap, (candidate, neighbour))

        if destination not in best:
            raise ValueError(f"no route from {origin!r} to {destination!r}")

        path = [destination]
        while path[-1] != origin:
            path.append(prev[path[-1]])
        path.reverse()
        return path

    def _summarise(
        self, origin: str, destination: str, path: list[str], avoided: list[str]
    ) -> RoutePlan:
        """Recompute the components along a chosen path for reporting."""
        travel_total = 0.0
        penalty_total = 0.0
        on_path: list[str] = []

        for a, b in zip(path, path[1:]):
            travel_total += self.corridor_travel_s(a, b, _SPEED_BY_CORRIDOR[corridor_id(a, b)])
            penalty, blocking = self.corridor_obstacle_penalty(a, b)
            penalty_total += penalty
            on_path.extend(blocking)

        stops = [self.station_dwell(s) for s in path]
        # The final stop's dwell is reported for the operator but excluded from
        # journey cost, matching the search above.
        dwell_total = float(sum(s.total_dwell_s for s in stops[:-1]))

        return RoutePlan(
            origin=origin,
            destination=destination,
            path=path,
            total_cost_s=travel_total + penalty_total + dwell_total,
            travel_s=travel_total,
            dwell_s=dwell_total,
            obstacle_penalty_s=penalty_total,
            stops=stops,
            avoided_corridors=list(avoided),
            obstacle_ids_on_path=sorted(set(on_path)),
            ramp_dispatch_at=[s.station_id for s in stops if s.ramp_predispatch],
        )
