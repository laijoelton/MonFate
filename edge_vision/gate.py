"""Temporal confirmation gate.

Raw per-frame detections are noisy. This gate only reports `accepted` after N
consecutive frames agree on the same accepted label (with exactly one object in
view), and re-arms when the scene clears.

It is a *local confirmation cue*, not an authority — it does not create a record
or make a decision. The backend remains the source of truth.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class GateResult:
    status: str  # "idle" | "confirming" | "accepted" | "rejected"
    label: str | None
    consecutive: int
    emitted_acceptance: bool = False


class ConsecutiveDetectionGate:
    def __init__(self, accepted_classes: set[str], required_consecutive: int = 5) -> None:
        if not isinstance(required_consecutive, int) or required_consecutive < 1:
            raise ValueError("required_consecutive must be a positive integer")
        self.accepted = frozenset(accepted_classes)
        self.required_consecutive = required_consecutive
        self._label: str | None = None
        self._consecutive = 0
        self._accepted = False

    def observe(self, label: str | None) -> GateResult:
        """Record one single-object observation. `None` re-arms the gate."""
        if label is None:
            self._label, self._consecutive, self._accepted = None, 0, False
            return GateResult("idle", None, 0)

        if label not in self.accepted:
            self._label, self._consecutive = None, 0
            return GateResult("rejected", label, 0)

        if self._accepted:
            return GateResult("accepted", self._label, self._consecutive)

        if label == self._label:
            self._consecutive += 1
        else:
            self._label, self._consecutive = label, 1

        if self._consecutive >= self.required_consecutive:
            self._accepted = True
            return GateResult("accepted", label, self._consecutive, emitted_acceptance=True)
        return GateResult("confirming", label, self._consecutive)
