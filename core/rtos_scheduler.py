"""Deterministic fixed-priority preemptive dispatcher, FreeRTOS semantics.

Mirrors the parts of the FreeRTOS scheduler that matter for MonFate:

* **Fixed-priority preemptive.** The highest-priority READY task always holds
  the CPU. A higher-priority task becoming ready preempts the running one on
  the very next tick — not at the next yield point.
* **Numerically higher == more urgent**, as in FreeRTOS (`configMAX_PRIORITIES-1`
  is the top band), so `CRITICAL_PREEMPT (3) > URGENT_TACTICAL (2) > NORMAL_PERIODIC (1)`.
* **Round-robin within a band.** Equal-priority tasks run FIFO by arrival, and a
  preempted task returns to the *head* of its band rather than the back, so
  being interrupted never costs it its turn.
* **Deterministic.** Ties break on `(priority, arrival_seq)`, never on wall
  clock or dict ordering, so a trace replays identically. That is what makes
  the preemption guarantee testable rather than merely probable.

Starvation is a real and *intended* property: under sustained Priority-3 load,
Priority-1 telemetry does not run. Fixed-priority preemption behaves this way by
design, and inventing priority aging here would mean a data-corruption failover
could be delayed by GPS breadcrumbs. `SchedulerMetrics.starved_task_ids` makes
the starvation visible instead of hiding it.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from enum import Enum, IntEnum
from typing import Callable, Iterable


class Priority(IntEnum):
    """FreeRTOS-style bands. Higher value preempts lower."""

    NORMAL_PERIODIC = 1
    URGENT_TACTICAL = 2
    CRITICAL_PREEMPT = 3


class EventKind(str, Enum):
    """The MonFate event taxonomy, grouped by the band each one belongs to."""

    # --- Priority 3: system breakdown and infrastructure failure ---
    DATA_CORRUPTION = "data_corruption"
    PAYLOAD_SCHEMA_MISMATCH = "payload_schema_mismatch"
    INFERENCE_PIPELINE_CRASH = "inference_pipeline_crash"
    CLOUD_HEARTBEAT_TIMEOUT = "cloud_heartbeat_timeout"
    EDGE_LINK_DROP = "edge_link_drop"

    # --- Priority 2: physical transit disruption ---
    TRAFFIC_ACCIDENT = "traffic_accident"
    VEHICLE_MECHANICAL_FAULT = "vehicle_mechanical_fault"
    RAMP_DEPLOYMENT_FAILURE = "ramp_deployment_failure"
    WHEELCHAIR_PATH_BLOCKED = "wheelchair_path_blocked"

    # --- Priority 1: routine fleet telemetry ---
    GPS_BREADCRUMB = "gps_breadcrumb"
    VELOCITY_SAMPLE = "velocity_sample"
    STOP_APPROACH = "stop_approach"


_PRIORITY_OF: dict[EventKind, Priority] = {
    EventKind.DATA_CORRUPTION: Priority.CRITICAL_PREEMPT,
    EventKind.PAYLOAD_SCHEMA_MISMATCH: Priority.CRITICAL_PREEMPT,
    EventKind.INFERENCE_PIPELINE_CRASH: Priority.CRITICAL_PREEMPT,
    EventKind.CLOUD_HEARTBEAT_TIMEOUT: Priority.CRITICAL_PREEMPT,
    EventKind.EDGE_LINK_DROP: Priority.CRITICAL_PREEMPT,
    EventKind.TRAFFIC_ACCIDENT: Priority.URGENT_TACTICAL,
    EventKind.VEHICLE_MECHANICAL_FAULT: Priority.URGENT_TACTICAL,
    EventKind.RAMP_DEPLOYMENT_FAILURE: Priority.URGENT_TACTICAL,
    EventKind.WHEELCHAIR_PATH_BLOCKED: Priority.URGENT_TACTICAL,
    EventKind.GPS_BREADCRUMB: Priority.NORMAL_PERIODIC,
    EventKind.VELOCITY_SAMPLE: Priority.NORMAL_PERIODIC,
    EventKind.STOP_APPROACH: Priority.NORMAL_PERIODIC,
}


def classify(kind: EventKind) -> Priority:
    """Map an event kind to its scheduling band.

    Raises on an unmapped kind rather than defaulting: silently filing an
    unknown fault as routine telemetry is exactly how a real outage gets
    scheduled behind GPS breadcrumbs.
    """
    try:
        return _PRIORITY_OF[kind]
    except KeyError as exc:
        raise ValueError(f"unclassified event kind: {kind!r}") from exc


#: The standing response for each band. The scheduler records these on dispatch;
#: wiring them to real subsystems is the integration layer's job.
BAND_ACTIONS: dict[Priority, tuple[str, ...]] = {
    Priority.CRITICAL_PREEMPT: (
        "broadcast_failover",
        "degrade_to_offline_cached_routing",
        "write_fallback_log",
    ),
    Priority.URGENT_TACTICAL: (
        "trigger_dynamic_rerouting",
        "alert_operator_cockpit",
        "update_station_dwell_times",
    ),
    Priority.NORMAL_PERIODIC: ("record_telemetry",),
}


class TaskState(str, Enum):
    READY = "ready"
    RUNNING = "running"
    PREEMPTED = "preempted"
    DONE = "done"


@dataclass
class Task:
    """One unit of schedulable work."""

    task_id: str
    kind: EventKind
    ticks_required: int = 1
    payload: dict = field(default_factory=dict)
    release_tick: int = 0

    priority: Priority = field(init=False)
    state: TaskState = field(init=False, default=TaskState.READY)
    ticks_run: int = field(init=False, default=0)
    arrival_seq: int = field(init=False, default=-1)
    started_tick: int | None = field(init=False, default=None)
    finished_tick: int | None = field(init=False, default=None)
    preemption_count: int = field(init=False, default=0)

    def __post_init__(self) -> None:
        if self.ticks_required < 1:
            raise ValueError("ticks_required must be >= 1")
        if self.release_tick < 0:
            raise ValueError("release_tick must be >= 0")
        self.priority = classify(self.kind)

    @property
    def remaining(self) -> int:
        return max(0, self.ticks_required - self.ticks_run)


@dataclass(frozen=True)
class TickRecord:
    """What the CPU did on one tick — the replayable execution trace."""

    tick: int
    task_id: str | None
    priority: Priority | None
    preempted_task_id: str | None = None
    completed: bool = False
    actions: tuple[str, ...] = ()


@dataclass
class SchedulerMetrics:
    total_ticks: int = 0
    idle_ticks: int = 0
    preemptions: int = 0
    completed: list[str] = field(default_factory=list)
    starved_task_ids: list[str] = field(default_factory=list)

    def response_ticks(self, task: Task) -> int | None:
        """Ticks between a task being released and first reaching the CPU."""
        if task.started_tick is None:
            return None
        return task.started_tick - task.release_tick


class PriorityScheduler:
    """Fixed-priority preemptive dispatcher over a discrete tick timeline."""

    def __init__(self, *, on_dispatch: Callable[[TickRecord], None] | None = None) -> None:
        # One FIFO per band. deque so a preempted task can go back on the left.
        self._ready: dict[Priority, deque[Task]] = {p: deque() for p in Priority}
        self._pending: list[Task] = []  # released at a future tick
        self._tasks: dict[str, Task] = {}
        self._running: Task | None = None
        self._tick = 0
        self._arrival_counter = 0
        self._on_dispatch = on_dispatch
        self.trace: list[TickRecord] = []
        self.metrics = SchedulerMetrics()

    # --- submission -------------------------------------------------------

    def submit(self, task: Task) -> Task:
        """Queue a task. Released immediately unless `release_tick` is later."""
        if task.task_id in self._tasks:
            raise ValueError(f"duplicate task_id: {task.task_id}")
        task.arrival_seq = self._arrival_counter
        self._arrival_counter += 1
        self._tasks[task.task_id] = task
        if task.release_tick <= self._tick:
            self._ready[task.priority].append(task)
        else:
            self._pending.append(task)
        return task

    def submit_all(self, tasks: Iterable[Task]) -> None:
        for t in tasks:
            self.submit(t)

    # --- scheduling core --------------------------------------------------

    def _release_due(self) -> None:
        still_pending = []
        for t in self._pending:
            if t.release_tick <= self._tick:
                self._ready[t.priority].append(t)
            else:
                still_pending.append(t)
        self._pending = still_pending

    def _highest_ready_band(self) -> Priority | None:
        for p in sorted(Priority, reverse=True):
            if self._ready[p]:
                return p
        return None

    def tick(self) -> TickRecord:
        """Advance one tick: release, preempt if needed, run the top task."""
        self._release_due()
        preempted_id: str | None = None

        top = self._highest_ready_band()

        # Preemption check: a strictly higher band is ready than the one running.
        if self._running is not None and top is not None and top > self._running.priority:
            victim = self._running
            victim.state = TaskState.PREEMPTED
            victim.preemption_count += 1
            # Back to the HEAD of its own band — preemption must not cost it
            # its place behind equal-priority peers that arrived later.
            self._ready[victim.priority].appendleft(victim)
            self._running = None
            preempted_id = victim.task_id
            self.metrics.preemptions += 1

        if self._running is None and top is not None:
            self._running = self._ready[top].popleft()
            if self._running.started_tick is None:
                self._running.started_tick = self._tick

        record: TickRecord
        if self._running is None:
            self.metrics.idle_ticks += 1
            record = TickRecord(tick=self._tick, task_id=None, priority=None,
                                preempted_task_id=preempted_id)
        else:
            task = self._running
            task.state = TaskState.RUNNING
            task.ticks_run += 1
            completed = task.remaining == 0
            actions = BAND_ACTIONS[task.priority] if completed else ()
            if completed:
                task.state = TaskState.DONE
                task.finished_tick = self._tick
                self.metrics.completed.append(task.task_id)
                self._running = None
            record = TickRecord(
                tick=self._tick,
                task_id=task.task_id,
                priority=task.priority,
                preempted_task_id=preempted_id,
                completed=completed,
                actions=actions,
            )

        self.trace.append(record)
        if self._on_dispatch is not None:
            self._on_dispatch(record)
        self._tick += 1
        self.metrics.total_ticks += 1
        return record

    def run_until_idle(self, *, max_ticks: int = 10_000) -> list[TickRecord]:
        """Run until nothing is ready or pending. Bounded so a bug can't hang."""
        start = len(self.trace)
        while max_ticks > 0:
            if (
                self._running is None
                and not self._pending
                and all(not q for q in self._ready.values())
            ):
                break
            self.tick()
            max_ticks -= 1
        else:
            raise RuntimeError("scheduler exceeded max_ticks; suspect a scheduling bug")

        self.metrics.starved_task_ids = [
            t.task_id for t in self._tasks.values() if t.state is not TaskState.DONE
        ]
        return self.trace[start:]

    # --- introspection ----------------------------------------------------

    @property
    def current_tick(self) -> int:
        return self._tick

    def task(self, task_id: str) -> Task:
        return self._tasks[task_id]

    def execution_order(self) -> list[str]:
        """Task ids in completion order."""
        return list(self.metrics.completed)

    def ready_depth(self) -> dict[Priority, int]:
        return {p: len(q) for p, q in self._ready.items()}
