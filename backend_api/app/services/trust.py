"""Trust consensus scoring.

Implements the model documented in docs/PROJECT_STATE.md: an obstacle's
believability is a function of how many independent signals corroborate it, how
diverse those reporters are, and how recently it was confirmed.

The recency decay is the important part. A blocked ramp reported two hours ago
and never re-confirmed is not the same claim as one confirmed 30 seconds ago,
and routing a wheelchair user around a phantom obstacle has a real cost.
"""

from __future__ import annotations

from datetime import datetime, timezone
from math import exp

from app.config import get_settings
from app.schemas.trust import ReportSignal, TrustConsensus

settings = get_settings()

#: Weight per signal source. A CV detection and an operator confirmation are
#: worth more than a single anonymous rider tap, but no single source can reach
#: certainty alone — corroboration is what moves the score.
SIGNAL_WEIGHT: dict[ReportSignal, float] = {
    ReportSignal.RIDER_REPORT: 1.0,
    ReportSignal.CV_DETECTION: 1.6,
    ReportSignal.OPERATOR_CONFIRMATION: 2.4,
    ReportSignal.AUTO_EXPIRY: 0.0,
}

#: Score a lone, brand-new, uncorroborated rider report starts at.
BASE_SCORE = 40.0
MAX_SCORE = 100.0

#: Saturation rate for corroboration. Deliberately gentle: the score must
#: approach certainty asymptotically, never reach it. A trust score that pegs at
#: 100 after three taps tells a wheelchair user nothing they can weigh, and the
#: UI's "94% Trust Score" only means something if 94 is reachable and 100 is not.
SATURATION_K = 0.15


def decay_factor(minutes_since: float, half_life_min: float | None = None) -> float:
    """Exponential recency decay in [0, 1]."""
    half_life = half_life_min or settings.TRUST_DECAY_HALF_LIFE_MIN
    if half_life <= 0:
        return 1.0
    return 0.5 ** (max(0.0, minutes_since) / half_life)


def score(
    *,
    signals: list[tuple[ReportSignal, datetime]],
    distinct_reporters: int,
    now: datetime | None = None,
    half_life_min: float | None = None,
) -> float:
    """Compute a 0-100 trust score from corroborating signals.

    `signals` is (source, observed_at) pairs. `distinct_reporters` is how many
    different people/devices are represented — ten reports from one device is
    one opinion repeated, not ten independent confirmations, so diversity is
    scored separately from volume.
    """
    if not signals:
        return 0.0

    now = now or datetime.now(timezone.utc)
    corroboration = 0.0
    for source, observed_at in signals:
        minutes = (now - _as_utc(observed_at)).total_seconds() / 60.0
        corroboration += SIGNAL_WEIGHT.get(source, 1.0) * decay_factor(minutes, half_life_min)

    # Diversity multiplier saturates: the 2nd independent reporter matters far
    # more than the 12th.
    diversity = 1.0 + 0.35 * min(max(distinct_reporters - 1, 0), 4)

    # Freshest signal gates the whole score — everything decays together.
    freshest_min = min(
        (now - _as_utc(ts)).total_seconds() / 60.0 for _, ts in signals
    )
    recency = decay_factor(freshest_min, half_life_min)

    saturated = 1.0 - exp(-SATURATION_K * corroboration * diversity)
    raw = BASE_SCORE + (MAX_SCORE - BASE_SCORE) * saturated
    return round(min(MAX_SCORE, raw * (0.35 + 0.65 * recency)), 1)


def consensus(
    *,
    obstacle_id: str,
    signals: list[tuple[ReportSignal, datetime]],
    distinct_reporters: int,
    now: datetime | None = None,
) -> TrustConsensus:
    """Build the full TrustConsensus contract for an obstacle."""
    now = now or datetime.now(timezone.utc)
    last_source, last_ts = max(signals, key=lambda s: _as_utc(s[1])) if signals else (
        ReportSignal.RIDER_REPORT,
        now,
    )
    return TrustConsensus(
        obstacle_id=obstacle_id,
        score=score(signals=signals, distinct_reporters=distinct_reporters, now=now),
        signal_count=len(signals),
        distinct_reporter_count=distinct_reporters,
        last_signal=last_source,
        last_verified_at=_as_utc(last_ts),
        decay_half_life_minutes=settings.TRUST_DECAY_HALF_LIFE_MIN,
    )


def is_actionable(trust_score: float) -> bool:
    """Whether a score is high enough to reroute a rider or raise an alert."""
    return trust_score >= settings.TRUST_ACTIONABLE_SCORE


def _as_utc(ts: datetime) -> datetime:
    """SQLite hands back naive datetimes; treat those as UTC rather than crashing."""
    return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
