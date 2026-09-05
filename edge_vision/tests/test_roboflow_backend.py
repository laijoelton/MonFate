"""Hosted detection backend: parsing, translation, and failure behaviour."""

from __future__ import annotations

import numpy as np
import pytest

from edge_vision.inference.roboflow_backend import (
    MAX_CONSECUTIVE_FAILURES,
    RoboflowConfigError,
    RoboflowDetector,
    RoboflowUnavailable,
    _extract_predictions,
)

CONTRACT = ["wheelchair", "stroller", "mobility_aid", "ambulant", "other"]
FRAME = np.zeros((64, 64, 3), dtype=np.uint8)


class _FakeClient:
    """Stands in for InferenceHTTPClient; scripted responses or failures."""

    def __init__(self, responses=None, fail_with=None):
        self._responses = list(responses or [])
        self._fail_with = fail_with
        self.calls = 0

    def infer(self, frame, model_id=None):
        self.calls += 1
        if self._fail_with is not None:
            raise self._fail_with
        return self._responses.pop(0) if self._responses else {"predictions": []}


def _detector(monkeypatch, client, class_map=None):
    """Build a detector with the network client swapped out."""
    monkeypatch.setenv("ROBOFLOW_API_KEY", "test-key-not-real")
    detector = RoboflowDetector.__new__(RoboflowDetector)
    detector.model_id = "wheelchair-9qvfx/3"
    detector.class_names = list(CONTRACT)
    detector._class_map = class_map
    detector._min_interval = 0.0
    detector._last_call = 0.0
    detector._failures = 0
    detector._cached = []
    detector._client = client
    return detector


# --- configuration ---------------------------------------------------------

def test_missing_api_key_is_refused(monkeypatch):
    monkeypatch.delenv("ROBOFLOW_API_KEY", raising=False)
    with pytest.raises(RoboflowConfigError, match="ROBOFLOW_API_KEY"):
        RoboflowDetector("wheelchair-9qvfx/3")


def test_key_is_never_a_command_line_argument():
    import inspect

    from edge_vision import run as run_module

    source = inspect.getsource(run_module.parse_args)
    assert "--roboflow-api-key" not in source
    assert "api-key\", default=os.getenv(\"ROBOFLOW" not in source


# --- response parsing ------------------------------------------------------

def test_centre_boxes_convert_to_corner_boxes():
    preds = _extract_predictions({"predictions": [
        {"class": "wheelchair", "confidence": 0.9, "x": 50, "y": 40, "width": 20, "height": 10},
    ]})
    assert preds[0]["xyxy"] == (40.0, 35.0, 60.0, 45.0)


@pytest.mark.parametrize("result", [
    None, "", 42, {}, {"predictions": None}, {"predictions": "x"},
    {"predictions": [{"class": "wheelchair"}]},                    # no confidence
    {"predictions": [{"confidence": 0.9, "x": 1, "y": 1, "width": 1, "height": 1}]},  # no label
    {"predictions": [{"class": "wc", "confidence": 0.9, "x": "a", "y": 1, "width": 1, "height": 1}]},
])
def test_malformed_rows_are_skipped_not_raised(result):
    """One odd row must not stop dispatch for everyone at the stop."""
    assert _extract_predictions(result) == []


def test_confidence_floor_is_applied(monkeypatch):
    client = _FakeClient([{"predictions": [
        {"class": "wheelchair", "confidence": 0.42, "x": 10, "y": 10, "width": 4, "height": 4},
    ]}])
    det = _detector(monkeypatch, client)
    assert det.infer(FRAME, conf=0.60) == []


def test_detections_pass_the_floor(monkeypatch):
    client = _FakeClient([{"predictions": [
        {"class": "wheelchair", "confidence": 0.88, "x": 10, "y": 10, "width": 4, "height": 4},
    ]}])
    det = _detector(monkeypatch, client)
    out = det.infer(FRAME, conf=0.60)
    assert [(d.class_name, round(d.confidence, 2)) for d in out] == [("wheelchair", 0.88)]


# --- class translation -----------------------------------------------------

def test_hosted_labels_translate_onto_the_contract(monkeypatch):
    client = _FakeClient([{"predictions": [
        {"class": "Wheelchair", "confidence": 0.9, "x": 10, "y": 10, "width": 4, "height": 4},
    ]}])
    det = _detector(monkeypatch, client, class_map={"Wheelchair": "wheelchair"})
    assert [d.class_name for d in det.infer(FRAME, conf=0.5)] == ["wheelchair"]


def test_mapped_null_discards_a_hosted_class(monkeypatch):
    client = _FakeClient([{"predictions": [
        {"class": "person", "confidence": 0.9, "x": 10, "y": 10, "width": 4, "height": 4},
    ]}])
    det = _detector(monkeypatch, client, class_map={"person": None})
    assert det.infer(FRAME, conf=0.5) == []


def test_unmapped_hosted_class_fails_closed(monkeypatch):
    """A class the hosted project adds must not leak into dispatch unlabelled."""
    from edge_vision.inference.validation import ClassMapError

    client = _FakeClient([{"predictions": [
        {"class": "scooter", "confidence": 0.9, "x": 10, "y": 10, "width": 4, "height": 4},
    ]}])
    det = _detector(monkeypatch, client, class_map={"wheelchair": "wheelchair"})
    with pytest.raises(ClassMapError):
        det.infer(FRAME, conf=0.5)


# --- failure behaviour -----------------------------------------------------

def test_transient_failure_returns_nothing_but_is_counted(monkeypatch):
    client = _FakeClient(fail_with=ConnectionError("network down"))
    det = _detector(monkeypatch, client)
    with pytest.warns(RuntimeWarning, match="hosted inference failed"):
        assert det.infer(FRAME, conf=0.5) == []
    assert det._failures == 1


def test_sustained_outage_raises_rather_than_reporting_an_empty_stop(monkeypatch):
    """Silently returning 'nobody waiting' would skip a wheelchair user."""
    client = _FakeClient(fail_with=ConnectionError("network down"))
    det = _detector(monkeypatch, client)
    with pytest.warns(RuntimeWarning):
        for _ in range(MAX_CONSECUTIVE_FAILURES - 1):
            det.infer(FRAME, conf=0.5)
    with pytest.raises(RoboflowUnavailable, match="silently miss passengers"):
        det.infer(FRAME, conf=0.5)


def test_recovery_resets_the_failure_counter(monkeypatch):
    client = _FakeClient([{"predictions": []}])
    det = _detector(monkeypatch, client)
    det._failures = 5
    det.infer(FRAME, conf=0.5)
    assert det._failures == 0


def test_throttle_repeats_the_last_answer_rather_than_a_blank(monkeypatch):
    """Interleaving blanks would stop the 5-frame gate ever latching."""
    client = _FakeClient([{"predictions": [
        {"class": "wheelchair", "confidence": 0.9, "x": 10, "y": 10, "width": 4, "height": 4},
    ]}])
    det = _detector(monkeypatch, client)
    det._min_interval = 999.0

    first = det.infer(FRAME, conf=0.5)
    second = det.infer(FRAME, conf=0.5)
    assert [d.class_name for d in first] == ["wheelchair"]
    assert [d.class_name for d in second] == ["wheelchair"]
    assert client.calls == 1, "throttle should suppress the second network call"


def test_warmup_does_not_bill_a_request(monkeypatch):
    client = _FakeClient()
    det = _detector(monkeypatch, client)
    det.warmup()
    assert client.calls == 0
