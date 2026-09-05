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


def build_class_translation(
    checkpoint_names: list[str],
    contract_names: list[str],
    class_map: dict[str, str | None],
) -> list[str | None]:
    """Map each checkpoint class index onto a deployment-contract label.

    Third-party checkpoints — a Roboflow wheelchair-only export, say — carry
    their own label set, which `validate_class_names` rightly refuses because a
    silent index mismatch would file strollers as wheelchairs. This is the
    explicit, declared alternative: state the mapping in `classes.yaml` and it
    is checked rather than guessed.

    Returns a list aligned to checkpoint index, holding the contract label for
    that class or ``None`` to discard it. Fails closed on any checkpoint class
    the map does not mention, so adding a class upstream cannot quietly start
    firing dispatch events.
    """
    if not class_map:
        raise ClassMapError("class map must not be empty")

    unmapped = [n for n in checkpoint_names if n not in class_map]
    if unmapped:
        raise ClassMapError(
            f"checkpoint classes {unmapped!r} are absent from checkpoint_class_map; "
            "map each one to a contract label or to null to discard it"
        )

    unknown_targets = sorted(
        {t for t in class_map.values() if t is not None and t not in contract_names}
    )
    if unknown_targets:
        raise ClassMapError(
            f"class map targets {unknown_targets!r} are not in the contract {contract_names!r}"
        )

    translation = [class_map[n] for n in checkpoint_names]
    if all(t is None for t in translation):
        raise ClassMapError("class map discards every checkpoint class")
    return translation
