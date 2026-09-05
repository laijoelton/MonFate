"""Predictive system-health engine with a self-tuning threshold loop.

Watches infrastructure telemetry — packet loss, heartbeat jitter, inference
latency — and produces an anomaly probability and a failure risk score in
[0, 1]. Deliberately dependency-light: streaming statistics only, no sklearn,
no training step, so it runs anywhere the scheduler runs.

Two design choices worth knowing:

**Median/MAD instead of mean/stdev.** Infrastructure telemetry is spiky by
nature. A single 900 ms latency outlier drags a mean far enough that the *next*
genuine spike looks normal — the metric that should be screaming is the one that
went quiet. MAD is unmoved by a handful of outliers, so the baseline still
represents "healthy" after a bad minute.

**Persistence gates risk, not anomaly.** One anomalous window is noise; three in
a row is a trend. `anomaly_probability` reports the instant, `failure_risk`
folds in how long it has persisted, so a transient blip does not trip a failover
that degrades the whole fleet to cached routing.
"""

from __future__ import annotations

import statistics
from collections import deque
from dataclasses import dataclass, field
from math import exp, isfinite

#: Scale factor making MAD a consistent estimator of stdev for normal data.
_MAD_TO_SIGMA = 1.4826

#: When the baseline is perfectly constant, treat a deviation of this fraction
#: of the median as roughly one sigma. 5% is tight enough that a real fault
#: scores high, loose enough that float noise does not.
_FLAT_BASELINE_REL_SCALE = 0.05
#: Absolute floor so a median at or near zero cannot divide by ~0.
_FLAT_BASELINE_MIN_SCALE = 1e-6

#: Metrics the engine understands, and whether a HIGH value is the bad direction.
#: All three are "high is bad", but stating it explicitly keeps the door open
#: for a metric like throughput where low is the failure mode.
METRICS: dict[str, bool] = {
    "packet_loss_pct": True,
    "heartbeat_jitter_ms": True,
    "inference_latency_ms": True,
}


@dataclass(frozen=True)
class TelemetrySample:
    """One observation of infrastructure health."""

    timestamp: float
    packet_loss_pct: float
    heartbeat_jitter_ms: float
    inference_latency_ms: float

    def as_dict(self) -> dict[str, float]:
        return {
            "packet_loss_pct": self.packet_loss_pct,
            "heartbeat_jitter_ms": self.heartbeat_jitter_ms,
            "inference_latency_ms": self.inference_latency_ms,
        }


@dataclass(frozen=True)
class HealthAssessment:
    """The engine's verdict on one sample."""

    timestamp: float
    anomaly_probability: float
    failure_risk: float
    per_metric_z: dict[str, float]
    dominant_metric: str | None
    should_trigger_fallback: bool
    consecutive_anomalies: int
    status: str  # "warming_up" | "ok" | "elevated" | "critical"

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp,
            "anomaly_probability": round(self.anomaly_probability, 4),
            "failure_risk": round(self.failure_risk, 4),
            "dominant_metric": self.dominant_metric,
            "should_trigger_fallback": self.should_trigger_fallback,
            "status": self.status,
        }


@dataclass
class TuningState:
    """Thresholds the self-improvement loop owns."""

    #: Robust z above which a single metric counts as anomalous.
    z_threshold: float = 3.0
    #: Failure risk above which the fallback path is triggered.
    fallback_threshold: float = 0.70
    #: Consecutive anomalous windows before risk is allowed to saturate.
    persistence_target: int = 3

    true_positives: int = 0
    false_positives: int = 0
    false_negatives: int = 0
    true_negatives: int = 0
    adjustments: list[str] = field(default_factory=list)

    @property
    def precision(self) -> float | None:
        d = self.true_positives + self.false_positives
        return self.true_positives / d if d else None

    @property
    def recall(self) -> float | None:
        d = self.true_positives + self.false_negatives
        return self.true_positives / d if d else None

    def to_dict(self) -> dict:
        return {
            "z_threshold": round(self.z_threshold, 3),
            "fallback_threshold": round(self.fallback_threshold, 3),
            "precision": None if self.precision is None else round(self.precision, 3),
            "recall": None if self.recall is None else round(self.recall, 3),
            "tp": self.true_positives,
            "fp": self.false_positives,
            "fn": self.false_negatives,
            "tn": self.true_negatives,
        }


class HealthMonitor:
    """Streaming anomaly detector with an outcome-driven tuning loop."""

    def __init__(
        self,
        *,
        window: int = 60,
        warmup: int = 12,
        #: Consecutive anomalous samples after which the engine concedes this is
        #: the new normal and starts re-baselining. Until then anomalous samples
        #: are quarantined from the baseline (see `assess`).
        regime_change_after: int = 15,
        tuning: TuningState | None = None,
        #: Bounds on self-tuning. Without these the loop can walk the threshold
        #: to a degenerate value after a bad run and never recover.
        fallback_bounds: tuple[float, float] = (0.45, 0.92),
        z_bounds: tuple[float, float] = (1.8, 6.0),
    ) -> None:
        if warmup < 3:
            raise ValueError("warmup must be >= 3 to estimate a baseline")
        self.window = window
        self.warmup = warmup
        self.regime_change_after = regime_change_after
        self.tuning = tuning or TuningState()
        self.fallback_bounds = fallback_bounds
        self.z_bounds = z_bounds
        self._history: dict[str, deque[float]] = {m: deque(maxlen=window) for m in METRICS}
        self._consecutive = 0
        self.assessments: list[HealthAssessment] = []

    # --- scoring ----------------------------------------------------------

    def _robust_z(self, metric: str, value: float) -> float:
        """Median/MAD z-score. 0.0 while warming up or when the series is flat."""
        series = self._history[metric]
        if len(series) < self.warmup:
            return 0.0
        med = statistics.median(series)
        mad = statistics.median([abs(x - med) for x in series])
        if mad > 0.0:
            return (value - med) / (mad * _MAD_TO_SIGMA)

        # A perfectly flat baseline gives MAD 0 and would divide by zero.
        sd = statistics.pstdev(series)
        if sd > 0.0:
            return (value - med) / sd

        # Both zero: the series is a constant, which happens in synthetic feeds
        # and on an idle link. Scoring every deviation the same would make the
        # detector blind to magnitude — a 60x latency jump must not read like a
        # 1% wobble — so fall back to deviation relative to the median itself.
        if value == med:
            return 0.0
        scale = max(abs(med) * _FLAT_BASELINE_REL_SCALE, _FLAT_BASELINE_MIN_SCALE)
        return (value - med) / scale

    def assess(self, sample: TelemetrySample) -> HealthAssessment:
        """Score one sample, then fold it into the baseline."""
        values = sample.as_dict()
        warming = len(self._history["packet_loss_pct"]) < self.warmup

        z_by_metric: dict[str, float] = {}
        for metric, high_is_bad in METRICS.items():
            z = self._robust_z(metric, values[metric])
            # Only the bad direction counts. A latency drop is not an incident.
            z_by_metric[metric] = z if high_is_bad else -z

        worst_metric = max(z_by_metric, key=lambda m: z_by_metric[m])
        worst_z = z_by_metric[worst_metric]

        # Logistic squash centred on the tuned z threshold. The engine reports a
        # calibrated-ish probability rather than a raw z nobody can act on.
        anomaly_probability = 0.0 if warming else _sigmoid(1.4 * (worst_z - self.tuning.z_threshold))

        is_anomalous = (not warming) and worst_z >= self.tuning.z_threshold
        self._consecutive = self._consecutive + 1 if is_anomalous else 0

        # Persistence multiplier: a lone spike is capped well below the fallback
        # threshold; a sustained run is allowed to reach it.
        persistence = min(1.0, self._consecutive / max(1, self.tuning.persistence_target))
        failure_risk = 0.0 if warming else anomaly_probability * (0.45 + 0.55 * persistence)

        should_fallback = failure_risk >= self.tuning.fallback_threshold
        status = (
            "warming_up" if warming
            else "critical" if should_fallback
            else "elevated" if is_anomalous
            else "ok"
        )

        # Quarantine: an anomalous sample must not join the baseline that
        # defines "healthy", or a sustained outage teaches the detector that the
        # outage is normal and the alarm decays while the fault is still live.
        # Bounded, because a genuine permanent regime change (upgraded infra,
        # a new latency floor) must eventually be accepted rather than alarming
        # forever.
        conceded_new_regime = self._consecutive > self.regime_change_after
        if not is_anomalous or conceded_new_regime:
            for metric, value in values.items():
                self._history[metric].append(value)

        assessment = HealthAssessment(
            timestamp=sample.timestamp,
            anomaly_probability=_clamp01(anomaly_probability),
            failure_risk=_clamp01(failure_risk),
            per_metric_z={m: round(z, 3) for m, z in z_by_metric.items()},
            dominant_metric=None if warming else worst_metric,
            should_trigger_fallback=should_fallback,
            consecutive_anomalies=self._consecutive,
            status=status,
        )
        self.assessments.append(assessment)
        return assessment

    def ingest(self, samples: list[TelemetrySample]) -> list[HealthAssessment]:
        return [self.assess(s) for s in samples]

    # --- self-improvement -------------------------------------------------

    def record_outcome(self, *, predicted_failure: bool, actual_failure: bool) -> None:
        """Feed back what actually happened after a prediction."""
        t = self.tuning
        if predicted_failure and actual_failure:
            t.true_positives += 1
        elif predicted_failure and not actual_failure:
            t.false_positives += 1
        elif not predicted_failure and actual_failure:
            t.false_negatives += 1
        else:
            t.true_negatives += 1

    def adapt(self, *, min_precision: float = 0.75, min_recall: float = 0.80,
              step: float = 0.05) -> dict:
        """Nudge thresholds toward the precision/recall targets.

        Precision is checked first: a false failover degrades the whole fleet to
        cached routing, which is worse than reacting a window late. Only once
        precision is acceptable does a recall miss loosen the trigger.
        """
        t = self.tuning
        precision, recall = t.precision, t.recall
        lo, hi = self.fallback_bounds
        zlo, zhi = self.z_bounds
        before = (t.fallback_threshold, t.z_threshold)

        if precision is not None and precision < min_precision:
            t.fallback_threshold = min(hi, t.fallback_threshold + step)
            t.z_threshold = min(zhi, t.z_threshold + step * 4)
            reason = f"precision {precision:.2f} < {min_precision}: tightened"
        elif recall is not None and recall < min_recall:
            t.fallback_threshold = max(lo, t.fallback_threshold - step)
            t.z_threshold = max(zlo, t.z_threshold - step * 4)
            reason = f"recall {recall:.2f} < {min_recall}: loosened"
        else:
            reason = "within targets: unchanged"

        after = (t.fallback_threshold, t.z_threshold)
        record = {
            "reason": reason,
            "fallback_threshold": round(after[0], 3),
            "z_threshold": round(after[1], 3),
            "changed": before != after,
        }
        t.adjustments.append(reason)
        return record

    def recommended_queue_thresholds(self) -> dict[str, float]:
        """Scheduler-facing knobs derived from current confidence.

        When the engine is running hot, the escalation window widens so a
        borderline fault lands in the Priority-3 band sooner.
        """
        risk = self.assessments[-1].failure_risk if self.assessments else 0.0
        return {
            "escalate_to_critical_at_risk": round(self.tuning.fallback_threshold, 3),
            "preempt_guard_ticks": 1 if risk < 0.5 else 2,
            "telemetry_sample_divisor": 1 if risk < 0.5 else 4,
        }


def _sigmoid(x: float) -> float:
    if not isfinite(x):
        return 1.0 if x > 0 else 0.0
    if x < -60:
        return 0.0
    if x > 60:
        return 1.0
    return 1.0 / (1.0 + exp(-x))


def _clamp01(x: float) -> float:
    return 0.0 if x < 0.0 else 1.0 if x > 1.0 else x
