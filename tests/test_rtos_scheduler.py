"""Scheduler tests. The headline guarantee: Priority 3 preempts Priority 1."""

from __future__ import annotations

import pytest

from core.rtos_scheduler import (
    BAND_ACTIONS,
    EventKind,
    Priority,
    PriorityScheduler,
    Task,
    TaskState,
    classify,
)


def test_event_taxonomy_maps_to_expected_bands():
    assert classify(EventKind.DATA_CORRUPTION) is Priority.CRITICAL_PREEMPT
    assert classify(EventKind.PAYLOAD_SCHEMA_MISMATCH) is Priority.CRITICAL_PREEMPT
    assert classify(EventKind.INFERENCE_PIPELINE_CRASH) is Priority.CRITICAL_PREEMPT
    assert classify(EventKind.CLOUD_HEARTBEAT_TIMEOUT) is Priority.CRITICAL_PREEMPT
    assert classify(EventKind.EDGE_LINK_DROP) is Priority.CRITICAL_PREEMPT

    assert classify(EventKind.TRAFFIC_ACCIDENT) is Priority.URGENT_TACTICAL
    assert classify(EventKind.RAMP_DEPLOYMENT_FAILURE) is Priority.URGENT_TACTICAL
    assert classify(EventKind.WHEELCHAIR_PATH_BLOCKED) is Priority.URGENT_TACTICAL

    assert classify(EventKind.GPS_BREADCRUMB) is Priority.NORMAL_PERIODIC
    assert classify(EventKind.STOP_APPROACH) is Priority.NORMAL_PERIODIC


def test_priority_ordering_is_freertos_style():
    """Numerically higher must mean more urgent, as in FreeRTOS."""
    assert Priority.CRITICAL_PREEMPT > Priority.URGENT_TACTICAL > Priority.NORMAL_PERIODIC


# --- the required guarantee ------------------------------------------------

def test_priority3_strictly_preempts_running_priority1():
    """A P1 task already holding the CPU is suspended the tick a P3 arrives."""
    sch = PriorityScheduler()
    sch.submit(Task("gps", EventKind.GPS_BREADCRUMB, ticks_required=6))
    sch.submit(Task("corrupt", EventKind.DATA_CORRUPTION, ticks_required=2, release_tick=2))
    sch.run_until_idle()

    # P1 ran first (nothing else was ready), then was preempted at tick 2.
    assert sch.trace[0].task_id == "gps"
    assert sch.trace[1].task_id == "gps"
    assert sch.trace[2].task_id == "corrupt"
    assert sch.trace[2].preempted_task_id == "gps"

    # The critical task finishes before the routine one resumes.
    order = sch.execution_order()
    assert order.index("corrupt") < order.index("gps")
    assert sch.metrics.preemptions == 1

    # The preempted task is not discarded — it completes all its work.
    gps = sch.task("gps")
    assert gps.state is TaskState.DONE
    assert gps.ticks_run == 6
    assert gps.preemption_count == 1


def test_priority3_never_waits_behind_priority1_backlog():
    """A deep P1 backlog must not delay a critical fault by even one tick."""
    sch = PriorityScheduler()
    for i in range(20):
        sch.submit(Task(f"gps{i}", EventKind.GPS_BREADCRUMB, ticks_required=3))
    sch.submit(Task("linkdrop", EventKind.EDGE_LINK_DROP, ticks_required=1, release_tick=5))
    sch.run_until_idle()

    crit = sch.task("linkdrop")
    # Released at 5, on the CPU at 5: zero waiting despite 60 ticks of backlog.
    assert crit.started_tick == 5
    assert sch.metrics.response_ticks(crit) == 0
    assert sch.trace[5].task_id == "linkdrop"
    assert sch.trace[5].completed is True


def test_full_band_ordering_under_simultaneous_release():
    """All three released together must run strictly P3, then P2, then P1."""
    sch = PriorityScheduler()
    sch.submit(Task("routine", EventKind.VELOCITY_SAMPLE, ticks_required=1))
    sch.submit(Task("tactical", EventKind.TRAFFIC_ACCIDENT, ticks_required=1))
    sch.submit(Task("critical", EventKind.INFERENCE_PIPELINE_CRASH, ticks_required=1))
    sch.run_until_idle()

    assert sch.execution_order() == ["critical", "tactical", "routine"]


def test_equal_priority_is_fifo_by_arrival():
    sch = PriorityScheduler()
    sch.submit(Task("a", EventKind.GPS_BREADCRUMB, ticks_required=1))
    sch.submit(Task("b", EventKind.VELOCITY_SAMPLE, ticks_required=1))
    sch.submit(Task("c", EventKind.STOP_APPROACH, ticks_required=1))
    sch.run_until_idle()
    assert sch.execution_order() == ["a", "b", "c"]


def test_preempted_task_returns_to_head_of_its_band():
    """Being interrupted must not cost a task its place behind later peers."""
    sch = PriorityScheduler()
    sch.submit(Task("first", EventKind.GPS_BREADCRUMB, ticks_required=4))
    # A peer arrives while `first` is running, then a critical preempts both.
    sch.submit(Task("peer", EventKind.GPS_BREADCRUMB, ticks_required=1, release_tick=1))
    sch.submit(Task("crit", EventKind.CLOUD_HEARTBEAT_TIMEOUT, ticks_required=1, release_tick=2))
    sch.run_until_idle()

    order = sch.execution_order()
    assert order[0] == "crit"
    # `first` was mid-flight when preempted, so it resumes ahead of `peer`.
    assert order.index("first") < order.index("peer")


def test_completion_fires_the_band_action_set():
    sch = PriorityScheduler()
    sch.submit(Task("c", EventKind.DATA_CORRUPTION, ticks_required=1))
    sch.submit(Task("t", EventKind.RAMP_DEPLOYMENT_FAILURE, ticks_required=1))
    sch.submit(Task("r", EventKind.GPS_BREADCRUMB, ticks_required=1))
    sch.run_until_idle()

    by_task = {r.task_id: r.actions for r in sch.trace if r.completed}
    assert by_task["c"] == BAND_ACTIONS[Priority.CRITICAL_PREEMPT]
    assert "degrade_to_offline_cached_routing" in by_task["c"]
    assert by_task["t"] == BAND_ACTIONS[Priority.URGENT_TACTICAL]
    assert "trigger_dynamic_rerouting" in by_task["t"]
    assert by_task["r"] == BAND_ACTIONS[Priority.NORMAL_PERIODIC]


def test_sustained_critical_load_starves_routine_and_says_so():
    """Starvation is intended under fixed priority — it must be visible."""
    sch = PriorityScheduler()
    sch.submit(Task("gps", EventKind.GPS_BREADCRUMB, ticks_required=2))
    for i in range(6):
        sch.submit(Task(f"crit{i}", EventKind.EDGE_LINK_DROP, ticks_required=2, release_tick=i))
    # Stop early, while critical work is still arriving.
    for _ in range(8):
        sch.tick()

    assert sch.task("gps").state is not TaskState.DONE
    running = [r.task_id for r in sch.trace if r.task_id]
    assert all(t.startswith("crit") for t in running[1:]), running


def test_scheduler_is_deterministic_across_runs():
    def run() -> list[str | None]:
        sch = PriorityScheduler()
        sch.submit_all([
            Task("r1", EventKind.GPS_BREADCRUMB, ticks_required=3),
            Task("t1", EventKind.TRAFFIC_ACCIDENT, ticks_required=2, release_tick=1),
            Task("c1", EventKind.DATA_CORRUPTION, ticks_required=2, release_tick=2),
            Task("r2", EventKind.STOP_APPROACH, ticks_required=1, release_tick=1),
        ])
        sch.run_until_idle()
        return [r.task_id for r in sch.trace]

    assert run() == run()


def test_rejects_bad_input():
    with pytest.raises(ValueError):
        Task("x", EventKind.GPS_BREADCRUMB, ticks_required=0)
    with pytest.raises(ValueError):
        Task("x", EventKind.GPS_BREADCRUMB, release_tick=-1)

    sch = PriorityScheduler()
    sch.submit(Task("dup", EventKind.GPS_BREADCRUMB))
    with pytest.raises(ValueError, match="duplicate"):
        sch.submit(Task("dup", EventKind.GPS_BREADCRUMB))
