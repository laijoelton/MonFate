"""Fail closed when a checkpoint cannot prove its class ordering."""
from __future__ import annotations

import ast


class ClassMapError(ValueError):
    """Checkpoint labels do not match the deployment contract."""


def validate_class_names(raw: object, expected: list[str] | None = None) -> list[str]:
    if isinstance(raw, str):
        try:
            raw = ast.literal_eval(raw)
        except (ValueError, SyntaxError):
            raw = raw.split(",")
    if isinstance(raw, dict):
        if set(raw) != set(range(len(raw))):
            raise ClassMapError("class IDs must be contiguous integers starting at zero")
        raw = [raw[i] for i in range(len(raw))]
    if not isinstance(raw, (list, tuple)) or not raw:
        raise ClassMapError("checkpoint must contain an ordered class map")
    names = list(raw)
    if any(not isinstance(n, str) or not n.strip() for n in names) or len(set(names)) != len(names):
        raise ClassMapError("class names must be nonempty and unique")
    if expected is not None and names != expected:
        raise ClassMapError(f"checkpoint classes {names!r} do not match {expected!r}")
    return names
