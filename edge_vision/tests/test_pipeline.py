"""edge_vision unit tests — gate, mock detector, emitter, fallback chain.

Runs with just numpy (no opencv / torch / onnx needed).  `pytest edge_vision`.
"""

from __future__ import annotations

import numpy as np
import pytest

from edge_vision.gate import ConsecutiveDetectionGate
from edge_vision.emitter import EventEmitter
from edge_vision.inference.factory import MockDetector, load_detector

CLASSES = ["plastic", "metal", "glass"]


def test_gate_needs_n_consecutive_then_latches():
    g = ConsecutiveDetectionGate({"plastic", "metal"}, required_consecutive=3)
    assert g.observe("plastic").status == "confirming"
    assert g.observe("plastic").status == "confirming"
    r = g.observe("plastic")
    assert r.status == "accepted" and r.emitted_acceptance
    assert not g.observe("plastic").emitted_acceptance  # latched, no re-emit
    assert g.observe(None).status == "idle"             # scene clears -> re-arm


def test_gate_rejects_unaccepted_and_resets():
    g = ConsecutiveDetectionGate({"plastic"}, 2)
    g.observe("plastic")
    assert g.observe("glass").status == "rejected"
    assert g.observe("plastic").status == "confirming"  # streak was reset


def test_mock_detector_shape_and_classes():
    d = MockDetector(CLASSES)
    frame = np.zeros((480, 640, 3), np.uint8)
    seen = set()
    for _ in range(30):
        for det in d.infer(frame):
            assert det.class_name in CLASSES
            assert 0.0 <= det.confidence <= 1.0
            x1, y1, x2, y2 = det.xyxy
            assert x1 < x2 and y1 < y2
            seen.add(det.class_name)
    assert seen == set(CLASSES)  # cycles through all classes


def test_load_detector_mock_backend():
    d = load_detector("unused", backend="mock", class_names=CLASSES)
    assert isinstance(d, MockDetector)


def test_fallback_chain_raises_cleanly_when_nothing_available(tmp_path):
    missing = tmp_path / "model.pt"
    with pytest.raises(RuntimeError, match="no working inference backend"):
        load_detector(str(missing), fallback=True, class_names=CLASSES)


def test_emitter_fail_closed_on_unknown_label():
    em = EventEmitter("node_01", "m", {"plastic"}, sink="stdout")
    em.emit("plastic", 0.9, 1, 10)                      # ok
    with pytest.raises(ValueError):
        em.emit("cardboard", 0.9, 1, 10)                # not in allowed set
