import json
import sys

import numpy as np
import pytest

from edge_vision.inference.base import Detection
from edge_vision.tracking import BoxSmoother, filter_detections


def _configured_detection_confidence() -> float:
    """The deployed detection floor, read from the same config run.py reads."""
    import pathlib

    import yaml

    cfg = yaml.safe_load(
        (pathlib.Path(__file__).resolve().parents[1] / "classes.yaml").read_text()
    )
    return float(cfg["detection_confidence"])


def detection(x=0, name="wheelchair", confidence=.9):
    return Detection(0, name, confidence, (x, 0, x+100, 100))


def test_ema_dampens_jitter_and_tracks_by_iou_not_list_order():
    smoother = BoxSmoother(alpha=.25)
    assert smoother.update([detection(), detection(200)]) == []
    result = smoother.update([detection(208), detection(8)])
    assert [t.detection.xyxy[0] for t in result] == [2, 202]
    assert len({t.track_id for t in result}) == 2


def test_far_box_spike_cannot_drag_existing_box():
    smoother = BoxSmoother()
    smoother.update([detection()])
    smoother.update([detection()])
    result = smoother.update([detection(500)])
    assert len(result) == 1 and result[0].detection.xyxy[0] == 0
    assert result[0].missed == 1
    result = smoother.update([detection(5)])
    assert len(result) == 1 and result[0].track_id == 0 and result[0].missed == 0


def test_hold_expires_and_class_changes_do_not_match():
    smoother = BoxSmoother()
    smoother.update([detection()])
    smoother.update([detection()])
    assert smoother.update([])[0].missed == 1
    assert smoother.update([])[0].missed == 2
    assert smoother.update([]) == []
    smoother.update([detection()])
    assert smoother.update([detection(name="stroller")]) == []


def test_confidence_floor_and_nonfinite_outputs():
    found = [detection(confidence=c) for c in (.59, .60, .9, float("nan"), float("inf"), 1.1)]
    found.append(Detection(0, "wheelchair", .9, (0, 0, float("nan"), 50)))
    assert [d.confidence for d in filter_detections(found)] == [.6, .9]


def fake_age_models(monkeypatch, tmp_path):
    import cv2
    from edge_vision.download_age_models import MODEL_URLS
    from edge_vision.age_preview import AgePreview

    for name in MODEL_URLS:
        (tmp_path / name).write_bytes(b"stub")
    class Net:
        def __init__(self, output):
            self.output, self.calls = output, 0
        def setInput(self, blob):
            pass
        def forward(self):
            self.calls += 1
            return self.output.copy()
        def setPreferableBackend(self, backend):
            pass
        def setPreferableTarget(self, target):
            pass
    face = Net(np.array([[[[0, 1, .95, .2, .2, .8, .8]]]], dtype=np.float32))
    age = Net(np.array([[0, 0, 0, 0, .9, .1, 0, 0]], dtype=np.float32))
    monkeypatch.setattr(cv2.dnn, "readNetFromTensorflow", lambda *a: face)
    monkeypatch.setattr(cv2.dnn, "readNetFromCaffe", lambda *a: age)
    return AgePreview(tmp_path), face, age


def test_age_overlay_is_throttled_and_cache_clears_on_face_loss(monkeypatch, tmp_path):
    import cv2
    preview, face, age = fake_age_models(monkeypatch, tmp_path)
    labels = []
    monkeypatch.setattr(cv2, "putText", lambda frame, text, *args: labels.append(text))
    for _ in range(6):
        preview.render(np.zeros((100, 100, 3), np.uint8))
    assert face.calls == 6 and age.calls == 2
    assert labels == ["Age approx. 25-32"] * 6
    face.output[..., 2] = 0
    preview.render(np.zeros((100, 100, 3), np.uint8))
    assert preview._scores == {}


def test_age_nonfinite_output_and_small_faces_are_ignored(monkeypatch, tmp_path):
    preview, face, age = fake_age_models(monkeypatch, tmp_path)
    age.output[:] = np.nan
    preview.render(np.zeros((100, 100, 3), np.uint8))
    assert not preview._scores
    face.output[..., 5:7] = .21
    preview.render(np.zeros((100, 100, 3), np.uint8))
    assert age.calls == 1


def test_age_models_missing_is_actionable(tmp_path):
    from edge_vision.age_preview import AgePreview
    with pytest.raises(FileNotFoundError, match="download_age_models"):
        AgePreview(tmp_path)


def test_demographics_requires_preview(monkeypatch):
    from edge_vision import run
    monkeypatch.setattr(sys, "argv", ["run", "--demographics"])
    with pytest.raises(SystemExit):
        run.parse_args()


@pytest.mark.parametrize("enabled", [False, True])
def test_preview_holds_and_age_never_enter_gate_or_events(monkeypatch, capsys, enabled):
    import cv2
    from edge_vision import run, age_preview
    index, age_calls, emit_frames = [0], [], []
    class FakeDetector:
        model_version, is_simulation = "mock", True
        def __init__(self, *a, **kw): pass
        def warmup(self): pass
        def infer(self, frame, conf):
            # Assert the CONFIGURED floor reaches inference, not a literal.
            # detection_confidence is a property of whichever checkpoint is
            # deployed and is re-measured when the model changes, so pinning a
            # number here breaks the suite on every legitimate retune.
            assert conf == _configured_detection_confidence()
            # The backend deliberately ignores its threshold. Frame 5 must
            # reset the gate despite the preview retaining its previous box.
            return [detection(confidence=.59 if index[0] == 5 else .9)]
    class Capture:
        def read(self):
            index[0] += 1
            return True, np.zeros((120, 120, 3), np.uint8)
        def release(self): pass
    class FakeAge:
        def __init__(self, *a): age_calls.append("init")
        def render(self, frame): age_calls.append("render")
    monkeypatch.setattr(run, "MobilityDetector", FakeDetector)
    monkeypatch.setattr(run, "open_source", lambda source: Capture())
    monkeypatch.setattr(age_preview, "AgePreview", FakeAge)
    monkeypatch.setattr(cv2, "imshow", lambda *a: None)
    monkeypatch.setattr(cv2, "waitKey", lambda *a: -1)
    monkeypatch.setattr(cv2, "destroyAllWindows", lambda: None)
    monkeypatch.delenv("SYS_API_BASE_URL", raising=False)
    args = ["run", "--preview", "--no-person-association", "--max-frames", "11"] + (["--demographics"] if enabled else [])
    monkeypatch.setattr(sys, "argv", args)
    original = run.EventEmitter._deliver
    def deliver(self, event):
        emit_frames.append(index[0])
        original(self, event)
    monkeypatch.setattr(run.EventEmitter, "_deliver", deliver)
    run.main()
    assert emit_frames == [10]
    assert age_calls == (["init"] + ["render"] * 11 if enabled else [])
    records = [json.loads(line) for line in capsys.readouterr().out.splitlines() if line.startswith("{")]
    assert len(records) == 1
    assert not ({"age", "gender", "face", "image", "track_id"} & records[0].keys())
