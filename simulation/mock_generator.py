"""Mock dataset generator: Cyberjaya traffic, system faults, obstacle reports.

Every generator takes an explicit `seed` and derives all randomness from it, so
a demo, a test failure, and a teammate's laptop all produce the same data. A
scheduler test that passes only on some seeds is not a test.

Run it directly to dump a full scenario as JSON:

    python -m simulation.mock_generator --seed 7 --minutes 30
"""

from __future__ import annotations

import argparse
import json
import math
import random
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone

from core.health_monitor import TelemetrySample
from core.rtos_scheduler import EventKind, Task
from routing.cyberjaya_stations import CORRIDORS, all_station_ids, corridor_id
from routing.optimizer import ObstacleReport

#: Morning and evening commute peaks, as fractions of a 24h day.
_PEAK_HOURS = (8.0, 18.0)


@dataclass
class Scenario:
    """A complete generated dataset."""

    traffic: dict[str, float]
    obstacles: list[ObstacleReport]
    telemetry: list[TelemetrySample]
    fault_windows: list[tuple[int, int]]
    tasks: list[Task]

    def to_dict(self) -> dict:
        return {
            "traffic": self.traffic,
            "obstacles": [
                {**asdict(o), "last_verified_at": o.last_verified_at.isoformat()}
                for o in self.obstacles
            ],
            "telemetry": [asdict(t) for t in self.telemetry],
            "fault_windows": self.fault_windows,
            "tasks": [
                {"task_id": t.task_id, "kind": t.kind.value,
                 "priority": int(t.priority), "release_tick": t.release_tick}
                for t in self.tasks
            ],
        }


def generate_traffic(
    *, seed: int = 0, hour_of_day: float = 8.0
) -> dict[str, float]:
    """Congestion per corridor in [0, 1], peaked around commute hours.

    Corridors nearer the city centre carry a higher base load, so a detour is
    not uniformly cheap and the optimizer has something real to trade off.
    """
    rng = random.Random(seed)
    # Distance in hours to the nearest peak, wrapped over a 24h clock.
    peak_proximity = min(
        min(abs(hour_of_day - p), 24.0 - abs(hour_of_day - p)) for p in _PEAK_HOURS
    )
    peak_factor = math.exp(-((peak_proximity / 2.5) ** 2))

    out: dict[str, float] = {}
    for a, b, _speed in CORRIDORS:
        central = sum(1 for s in (a, b) if "city_centre" in s or "dpulze" in s)
        base = 0.18 + 0.16 * central
        jitter = rng.uniform(-0.06, 0.06)
        out[corridor_id(a, b)] = round(min(1.0, max(0.0, base + 0.55 * peak_factor + jitter)), 3)
    return out


def generate_obstacles(
    *, seed: int = 0, count: int = 4, now: datetime | None = None
) -> list[ObstacleReport]:
    """Community barrier reports spread across trust levels and ages.

    Deliberately mixes actionable and non-actionable reports: a generator that
    only emits high-trust barriers would never exercise the trust gate, which
    is the part most likely to be wrong.
    """
    rng = random.Random(seed + 1000)
    now = now or datetime.now(timezone.utc)
    corridor_keys = [corridor_id(a, b) for a, b, _ in CORRIDORS]
    descriptions = [
        "Construction hoarding narrowing the pedestrian crossing",
        "Delivery van parked across the kerb ramp",
        "Broken tactile paving at the crossing island",
        "Flooded underpass, step-free route unusable",
        "Temporary barrier from roadworks blocking the ramp landing",
    ]

    reports: list[ObstacleReport] = []
    for i in range(count):
        trust = rng.choice([35.0, 52.0, 74.0, 88.0, 95.0])
        age_min = rng.choice([5, 20, 90, 240, 600])
        reports.append(
            ObstacleReport(
                obstacle_id=f"obs-{seed}-{i:02d}",
                corridor=rng.choice(corridor_keys),
                description=rng.choice(descriptions),
                trust_score=trust,
                last_verified_at=now - timedelta(minutes=age_min),
                blocks_wheelchair=rng.random() < 0.8,
            )
        )
    return reports


def generate_telemetry(
    *,
    seed: int = 0,
    minutes: int = 60,
    fault_windows: list[tuple[int, int]] | None = None,
) -> tuple[list[TelemetrySample], list[tuple[int, int]]]:
    """Infrastructure telemetry with injected degradation windows.

    Returns the samples and the ground-truth fault windows, so the health
    engine's predictions can be scored against what actually happened rather
    than against its own output.
    """
    rng = random.Random(seed + 2000)
    if fault_windows is None:
        start = rng.randint(minutes // 3, max(minutes // 3, minutes - 12))
        fault_windows = [(start, min(minutes - 1, start + 8))]

    def in_fault(i: int) -> bool:
        return any(lo <= i <= hi for lo, hi in fault_windows)

    samples: list[TelemetrySample] = []
    t0 = 1_760_000_000.0
    for i in range(minutes):
        if in_fault(i):
            # Degradation ramps rather than stepping: a cliff-edge fault is
            # trivially detectable and would flatter the detector.
            ramp = min(1.0, (i - min(lo for lo, _ in fault_windows) + 1) / 4.0)
            packet_loss = rng.gauss(0.4 + 7.5 * ramp, 0.6)
            jitter = rng.gauss(12.0 + 55.0 * ramp, 4.0)
            latency = rng.gauss(45.0 + 180.0 * ramp, 12.0)
        else:
            packet_loss = rng.gauss(0.4, 0.18)
            jitter = rng.gauss(12.0, 2.2)
            latency = rng.gauss(45.0, 5.0)
        samples.append(
            TelemetrySample(
                timestamp=t0 + i * 60.0,
                packet_loss_pct=max(0.0, round(packet_loss, 3)),
                heartbeat_jitter_ms=max(0.0, round(jitter, 2)),
                inference_latency_ms=max(1.0, round(latency, 2)),
            )
        )
    return samples, fault_windows


def generate_tasks(*, seed: int = 0, count: int = 24) -> list[Task]:
    """A mixed task load, weighted the way a real day is.

    Routine telemetry dominates; faults are rare. That ratio is the point — a
    scheduler only proves itself when the critical event is a needle in
    breadcrumbs.
    """
    rng = random.Random(seed + 3000)
    routine = [EventKind.GPS_BREADCRUMB, EventKind.VELOCITY_SAMPLE, EventKind.STOP_APPROACH]
    tactical = [
        EventKind.TRAFFIC_ACCIDENT,
        EventKind.VEHICLE_MECHANICAL_FAULT,
        EventKind.RAMP_DEPLOYMENT_FAILURE,
        EventKind.WHEELCHAIR_PATH_BLOCKED,
    ]
    critical = [
        EventKind.DATA_CORRUPTION,
        EventKind.PAYLOAD_SCHEMA_MISMATCH,
        EventKind.INFERENCE_PIPELINE_CRASH,
        EventKind.CLOUD_HEARTBEAT_TIMEOUT,
        EventKind.EDGE_LINK_DROP,
    ]

    tasks: list[Task] = []
    for i in range(count):
        roll = rng.random()
        kind = (
            rng.choice(critical) if roll < 0.10
            else rng.choice(tactical) if roll < 0.30
            else rng.choice(routine)
        )
        tasks.append(
            Task(
                task_id=f"t{i:03d}-{kind.value}",
                kind=kind,
                ticks_required=rng.randint(1, 3),
                release_tick=rng.randint(0, max(1, count // 2)),
                payload={"seed": seed, "index": i},
            )
        )
    return tasks


def generate_scenario(*, seed: int = 0, minutes: int = 60, hour_of_day: float = 8.0) -> Scenario:
    """One reproducible dataset covering all three modules."""
    telemetry, fault_windows = generate_telemetry(seed=seed, minutes=minutes)
    return Scenario(
        traffic=generate_traffic(seed=seed, hour_of_day=hour_of_day),
        obstacles=generate_obstacles(seed=seed),
        telemetry=telemetry,
        fault_windows=fault_windows,
        tasks=generate_tasks(seed=seed),
    )


def _main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--minutes", type=int, default=60)
    p.add_argument("--hour", type=float, default=8.0, help="hour of day, 0-24")
    p.add_argument("--stations", action="store_true", help="list station ids and exit")
    args = p.parse_args()

    if args.stations:
        print(json.dumps(all_station_ids(), indent=2))
        return

    scenario = generate_scenario(seed=args.seed, minutes=args.minutes, hour_of_day=args.hour)
    print(json.dumps(scenario.to_dict(), indent=2, default=str))


if __name__ == "__main__":
    _main()
