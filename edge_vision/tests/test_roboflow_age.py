"""Hosted age backend: response parsing, and the guarantees it must not break."""

from __future__ import annotations

import pytest

from edge_vision.roboflow_age import (
    DEFAULT_INTERVAL,
    RoboflowAgePreview,
    RoboflowConfigError,
    parse_age_response,
)


# --- configuration safety --------------------------------------------------

def test_missing_api_key_fails_with_actionable_guidance(monkeypatch):
    monkeypatch.delenv("ROBOFLOW_API_KEY", raising=False)
    with pytest.raises(RoboflowConfigError, match="ROBOFLOW_API_KEY"):
        RoboflowAgePreview()


def test_blank_api_key_is_treated_as_missing(monkeypatch):
    monkeypatch.setenv("ROBOFLOW_API_KEY", "   ")
    with pytest.raises(RoboflowConfigError, match="ROBOFLOW_API_KEY"):
        RoboflowAgePreview()


def test_key_is_not_accepted_from_the_command_line():
    """Keys on argv leak into shell history, `ps`, and CI logs."""
    from edge_vision.run import parse_args

    import sys

    argv = sys.argv
    try:
        sys.argv = ["run.py", "--help"]
        with pytest.raises(SystemExit):
            parse_args()
    finally:
        sys.argv = argv

    import inspect

    from edge_vision import run as run_module

    source = inspect.getsource(run_module.parse_args)
    assert "--roboflow-api-key" not in source
    assert "--age-api-key" not in source


def test_hosted_interval_is_far_less_frequent_than_local():
    """Each call is a billable inference and a face leaving the building."""
    from edge_vision.age_preview import AgePreview

    local_default = 5  # AgePreview.__init__ default
    assert DEFAULT_INTERVAL > local_default * 4
    assert AgePreview.__init__.__defaults__[-1] == local_default


# --- the invariant that must survive --------------------------------------

def test_age_never_reaches_the_event_schema():
    """Codex's guarantee: age is an overlay, never a dispatched attribute."""
    from edge_vision.emitter import DetectionEvent

    assert not any("age" in f.lower() for f in DetectionEvent.__annotations__)


def test_module_never_writes_frames_to_disk():
    import inspect

    from edge_vision import roboflow_age

    source = inspect.getsource(roboflow_age)
    for forbidden in ("imwrite", "open(", "NamedTemporaryFile", ".save("):
        assert forbidden not in source, f"hosted age path must not persist frames: {forbidden}"


# --- response parsing ------------------------------------------------------

def test_parses_list_shaped_predictions():
    result = {"predictions": [
        {"class": "25-32", "confidence": 0.61},
        {"class": "38-43", "confidence": 0.22},
    ]}
    assert parse_age_response(result) == ("25-32", 0.61)


def test_parses_dict_shaped_predictions():
    result = {"predictions": {
        "25-32": {"confidence": 0.44},
        "60-100": {"confidence": 0.51},
    }}
    assert parse_age_response(result) == ("60-100", 0.51)


def test_uses_label_key_when_class_is_absent():
    result = {"predictions": [{"label": "8-12", "confidence": 0.9}]}
    assert parse_age_response(result) == ("8-12", 0.9)


@pytest.mark.parametrize("result", [
    None, "", 42, [], {}, {"predictions": None}, {"predictions": []},
    {"predictions": [{"class": "25-32"}]},          # no confidence
    {"predictions": [{"confidence": 0.9}]},         # no label
    {"predictions": {"25-32": "not-a-dict"}},
])
def test_malformed_responses_degrade_rather_than_crash(result):
    """A hosted dependency returning junk must not kill the dispatch loop."""
    assert parse_age_response(result) is None
