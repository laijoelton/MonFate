"""Health engine tests: detection quality, and that the tuning loop converges."""

from __future__ import annotations

import pytest

from core.health_monitor import HealthMonitor, TelemetrySample, TuningState
from simulation.mock_generator import generate_telemetry


def _steady(n: int, start: float = 0.0) -> list[TelemetrySample]:
    return [
        TelemetrySample(
            timestamp=start + i,
            packet_loss_pct=0.4,
            heartbeat_jitter_ms=12.0,
            inference_latency_ms=45.0,
        )
        for i in range(n)
    ]


def test_warmup_reports_no_risk():
    hm = HealthMonitor(warmup=12)
    results = hm.ingest(_steady(5))
    assert all(r.status == "warming_up" for r in results)
    assert all(r.failure_risk == 0.0 for r in results)


def test_steady_state_stays_ok_with_no_false_alarms():
    hm = HealthMonitor(warmup=12)
    results = hm.ingest(_steady(60))
    settled = results[15:]
    assert all(not r.should_trigger_fallback for r in settled)
    assert all(r.failure_risk < 0.5 for r in settled)


def test_single_spike_does_not_trip_the_fallback():
    """Persistence gating: one bad window is noise, not an outage."""
    hm = HealthMonitor(warmup=12)
    hm.ingest(_steady(30))
    spike = TelemetrySample(
        timestamp=999, packet_loss_pct=25.0, heartbeat_jitter_ms=200.0,
        inference_latency_ms=800.0,
    )
    result = hm.assess(spike)

    assert result.anomaly_probability > 0.9  # it is clearly anomalous
    assert result.should_trigger_fallback is False  # but not yet actionable
    assert result.consecutive_anomalies == 1


def test_sustained_degradation_trips_the_fallback():
    hm = HealthMonitor(warmup=12)
    hm.ingest(_steady(30))
    bad = [
        TelemetrySample(timestamp=1000 + i, packet_loss_pct=25.0,
                        heartbeat_jitter_ms=200.0, inference_latency_ms=800.0)
        for i in range(5)
    ]
    results = hm.ingest(bad)
    assert any(r.should_trigger_fallback for r in results)
    assert results[-1].status == "critical"
    assert results[-1].failure_risk > results[0].failure_risk


def test_sustained_fault_does_not_desensitise():
    """An ongoing outage must not normalise itself into the baseline.

    Without quarantining anomalous samples, each bad reading widens the
    baseline, the z-score collapses, and the alarm decays back to `elevated`
    while the fault is still live — the boiling-frog failure.
    """
    hm = HealthMonitor(warmup=12)
    hm.ingest(_steady(30))
    results = hm.ingest([
        TelemetrySample(timestamp=1000 + i, packet_loss_pct=25.0,
                        heartbeat_jitter_ms=200.0, inference_latency_ms=800.0)
        for i in range(8)
    ])

    settled = results[2:]
    assert all(r.status == "critical" for r in settled), [r.status for r in results]
    assert all(r.should_trigger_fallback for r in settled)
    # Risk must not trend downward while the fault persists.
    assert settled[-1].failure_risk >= settled[0].failure_risk


def test_permanent_regime_change_is_eventually_accepted():
    """Quarantine is bounded: a new normal must stop alarming forever."""
    hm = HealthMonitor(warmup=12, regime_change_after=15)
    hm.ingest(_steady(30))
    results = hm.ingest([
        TelemetrySample(timestamp=3000 + i, packet_loss_pct=25.0,
                        heartbeat_jitter_ms=200.0, inference_latency_ms=800.0)
        for i in range(24)
    ])
    assert results[3].status == "critical"
    assert results[-1].status == "ok", "never re-baselined to the new regime"


def test_recovery_clears_the_alarm():
    hm = HealthMonitor(warmup=12)
    hm.ingest(_steady(30))
    hm.ingest([
        TelemetrySample(timestamp=1000 + i, packet_loss_pct=25.0,
                        heartbeat_jitter_ms=200.0, inference_latency_ms=800.0)
        for i in range(5)
    ])
    after = hm.ingest(_steady(10, start=2000))
    assert after[-1].should_trigger_fallback is False
    assert after[-1].consecutive_anomalies == 0


def test_identifies_the_dominant_failing_metric():
    hm = HealthMonitor(warmup=12)
    hm.ingest(_steady(30))
    latency_only = TelemetrySample(
        timestamp=999, packet_loss_pct=0.4, heartbeat_jitter_ms=12.0,
        inference_latency_ms=900.0,
    )
    assert hm.assess(latency_only).dominant_metric == "inference_latency_ms"


def test_detects_the_injected_fault_in_generated_telemetry():
    """End-to-end against the mock generator's ground truth."""
    samples, windows = generate_telemetry(seed=7, minutes=45)
    lo, hi = windows[0]
    hm = HealthMonitor(warmup=12)
    results = hm.ingest(samples)

    fired = [i for i, r in enumerate(results) if r.should_trigger_fallback]
    assert fired, "never detected the injected fault"
    # Detected promptly, and only inside the fault window.
    assert lo <= fired[0] <= lo + 3
    assert all(lo <= i <= hi + 1 for i in fired), fired


def test_outliers_do_not_poison_the_baseline():
    """Median/MAD must keep a healthy baseline after a burst of outliers."""
    hm = HealthMonitor(warmup=12)
    hm.ingest(_steady(40))
    hm.ingest([
        TelemetrySample(timestamp=500 + i, packet_loss_pct=40.0,
                        heartbeat_jitter_ms=300.0, inference_latency_ms=1200.0)
        for i in range(3)
    ])
    hm.ingest(_steady(6, start=900))
    # A fresh spike after the burst must still register as anomalous.
    later = hm.assess(TelemetrySample(
        timestamp=2000, packet_loss_pct=30.0, heartbeat_jitter_ms=250.0,
        inference_latency_ms=900.0,
    ))
    assert later.anomaly_probability > 0.8


# --- self-improvement loop -------------------------------------------------

def test_false_positives_tighten_the_thresholds():
    hm = HealthMonitor(tuning=TuningState(fallback_threshold=0.70, z_threshold=3.0))
    for _ in range(10):
        hm.record_outcome(predicted_failure=True, actual_failure=False)

    before = hm.tuning.fallback_threshold
    result = hm.adapt()
    assert result["changed"] is True
    assert hm.tuning.fallback_threshold > before
    assert hm.tuning.z_threshold > 3.0
    assert "precision" in result["reason"]


def test_missed_failures_loosen_the_thresholds():
    hm = HealthMonitor(tuning=TuningState(fallback_threshold=0.70, z_threshold=3.0))
    # Precision is perfect; recall is the problem.
    for _ in range(5):
        hm.record_outcome(predicted_failure=True, actual_failure=True)
    for _ in range(10):
        hm.record_outcome(predicted_failure=False, actual_failure=True)

    before = hm.tuning.fallback_threshold
    result = hm.adapt()
    assert hm.tuning.fallback_threshold < before
    assert "recall" in result["reason"]


def test_good_performance_leaves_thresholds_alone():
    hm = HealthMonitor(tuning=TuningState(fallback_threshold=0.70, z_threshold=3.0))
    for _ in range(9):
        hm.record_outcome(predicted_failure=True, actual_failure=True)
    hm.record_outcome(predicted_failure=False, actual_failure=False)

    result = hm.adapt()
    assert result["changed"] is False
    assert hm.tuning.fallback_threshold == 0.70


def test_tuning_is_bounded_in_both_directions():
    """Repeated one-sided feedback must not walk a threshold off a cliff."""
    hot = HealthMonitor(fallback_bounds=(0.45, 0.92))
    for _ in range(200):
        hot.record_outcome(predicted_failure=True, actual_failure=False)
        hot.adapt()
    assert hot.tuning.fallback_threshold <= 0.92

    cold = HealthMonitor(fallback_bounds=(0.45, 0.92))
    for _ in range(200):
        cold.record_outcome(predicted_failure=False, actual_failure=True)
        cold.adapt()
    assert cold.tuning.fallback_threshold >= 0.45


def test_precision_is_prioritised_over_recall():
    """When both targets are missed, tighten — a false failover is worse."""
    hm = HealthMonitor(tuning=TuningState(fallback_threshold=0.70, z_threshold=3.0))
    for _ in range(10):
        hm.record_outcome(predicted_failure=True, actual_failure=False)
    for _ in range(10):
        hm.record_outcome(predicted_failure=False, actual_failure=True)

    before = hm.tuning.fallback_threshold
    result = hm.adapt()
    assert "precision" in result["reason"]
    assert hm.tuning.fallback_threshold > before


def test_queue_thresholds_widen_as_risk_rises():
    hm = HealthMonitor(warmup=12)
    hm.ingest(_steady(30))
    calm = hm.recommended_queue_thresholds()

    hm.ingest([
        TelemetrySample(timestamp=1000 + i, packet_loss_pct=25.0,
                        heartbeat_jitter_ms=200.0, inference_latency_ms=800.0)
        for i in range(5)
    ])
    hot = hm.recommended_queue_thresholds()

    assert hot["telemetry_sample_divisor"] > calm["telemetry_sample_divisor"]
    assert hot["preempt_guard_ticks"] >= calm["preempt_guard_ticks"]


def test_rejects_too_short_a_warmup():
    with pytest.raises(ValueError):
        HealthMonitor(warmup=2)
