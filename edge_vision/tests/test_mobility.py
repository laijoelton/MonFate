"""Mobility contract, real runtime, runner gate, and privacy regressions."""
import json
import sys
from types import SimpleNamespace

import numpy as np
import pytest
import yaml

from edge_vision.detector import DISPATCH_CLASSES, MOBILITY_CLASSES, MobilityDetector
from edge_vision.emitter import EventEmitter
from edge_vision.gate import ConsecutiveDetectionGate
from edge_vision.inference.base import Detection
from edge_vision.inference.validation import ClassMapError, validate_class_names


@pytest.mark.parametrize("raw", [None, [], ["person"], MOBILITY_CLASSES[::-1], {1: "wheelchair"}, ["x", "x"]])
def test_class_map_rejects_incompatible(raw):
    with pytest.raises(ClassMapError):
        validate_class_names(raw, MOBILITY_CLASSES)


def test_class_map_accepts_ultralytics_metadata():
    assert validate_class_names(str(dict(enumerate(MOBILITY_CLASSES))), MOBILITY_CLASSES) == MOBILITY_CLASSES


def test_wrapper_never_mocks_mismatched_checkpoint(tmp_path, monkeypatch):
    from edge_vision import detector as module
    path = tmp_path / "wrong.pt"
    path.write_bytes(b"existing checkpoint")
    calls = []
    def reject(*args, **kwargs):
        calls.append(kwargs)
        raise ClassMapError("mismatch")
    monkeypatch.setattr(module, "load_detector", reject)
    with pytest.raises(ClassMapError):
        MobilityDetector(path)
    assert len(calls) == 1


@pytest.mark.parametrize("required", [1, 3, 4, 6, 5.0, True])
def test_runner_rejects_gate_override(tmp_path, monkeypatch, required):
    from edge_vision import run
    cfg = tmp_path / "classes.yaml"
    cfg.write_text(yaml.safe_dump({"names": MOBILITY_CLASSES, "accepted": sorted(DISPATCH_CLASSES),
                                   "required_consecutive": required}))
    monkeypatch.setattr(sys, "argv", ["run", "--config", str(cfg)])
    with pytest.raises(ValueError, match="exactly 5"):
        run.main()


@pytest.mark.parametrize("interrupt", [None, "other", "ambulant", "stroller"])
def test_five_frame_gate_interrupted(interrupt):
    gate = ConsecutiveDetectionGate(DISPATCH_CLASSES)
    for _ in range(4):
        assert not gate.observe("wheelchair").emitted_acceptance
    assert not gate.observe(interrupt).emitted_acceptance
    for _ in range(4):
        assert not gate.observe("wheelchair").emitted_acceptance
    assert gate.observe("wheelchair").emitted_acceptance
    assert not gate.observe("wheelchair").emitted_acceptance


def test_missing_and_simulation_fallback(tmp_path):
    with pytest.warns(RuntimeWarning, match="simulated"):
        detector = MobilityDetector(tmp_path / "missing.pt")
    assert detector.is_simulation and detector.model_version == "mock"
    corrupt = tmp_path / "bad.pt"
    corrupt.write_bytes(b"not weights")
    assert MobilityDetector(corrupt, simulation=True).is_simulation
    with pytest.raises(Exception):
        MobilityDetector(corrupt, fallback=False)


def make_onnx(path, names=MOBILITY_CLASSES, columns=9):
    import onnx
    from onnx import TensorProto, helper, numpy_helper

    raw = np.zeros((1, columns, 1), dtype=np.float32)
    raw[0, :4, 0] = [16, 16, 8, 8]
    raw[0, 4, 0] = 0.95
    graph = helper.make_graph(
        [helper.make_node("Constant", [], ["output"], value=numpy_helper.from_array(raw))],
        "test_head", [helper.make_tensor_value_info("images", TensorProto.FLOAT, [1, 3, 32, 32])],
        [helper.make_tensor_value_info("output", TensorProto.FLOAT, raw.shape)])
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)])
    model.ir_version = 9
    if names is not None:
        helper.set_model_props(model, {"names": str(dict(enumerate(names)))})
    onnx.save(model, path)


def test_real_onnx_runtime_and_coordinate_mapping(tmp_path):
    path = tmp_path / "valid.onnx"
    make_onnx(path)
    detector = MobilityDetector(path, device="cpu")
    result = detector.infer(np.zeros((64, 64, 3), np.uint8))
    assert not detector.is_simulation
    assert result[0].class_name == "wheelchair"
    assert result[0].xyxy == (24, 24, 40, 40)


@pytest.mark.parametrize("names", [None, ["person"], MOBILITY_CLASSES[::-1]])
def test_onnx_rejects_metadata_mismatch(tmp_path, names):
    path = tmp_path / "invalid.onnx"
    make_onnx(path, names=names)
    with pytest.raises(ClassMapError):
        MobilityDetector(path)


def test_onnx_rejects_wrong_head_size(tmp_path):
    path = tmp_path / "wrong.onnx"
    make_onnx(path, columns=10)
    with pytest.raises(ClassMapError, match="head size"):
        MobilityDetector(path)


def test_real_yolov8_checkpoint_validation(tmp_path):
    from ultralytics import YOLO
    from edge_vision.inference.pytorch_backend import PyTorchDetector

    # Build locally from packaged architecture; no pretrained download.
    model = YOLO("yolov8n.yaml")
    path = tmp_path / "coco.pt"
    model.save(path)
    with pytest.raises(ClassMapError):
        PyTorchDetector(path, class_names=MOBILITY_CLASSES, device="cpu")

    cfg = dict(model.model.yaml)
    cfg["nc"] = len(MOBILITY_CLASSES)
    architecture = tmp_path / "yolov8n.yaml"
    architecture.write_text(yaml.safe_dump(cfg))
    mobility = YOLO(str(architecture))
    mobility.model.names = dict(enumerate(MOBILITY_CLASSES))
    checkpoint = tmp_path / "mobility.pt"
    mobility.save(checkpoint)
    detector = PyTorchDetector(checkpoint, class_names=MOBILITY_CLASSES, device="cpu", imgsz=32)
    assert detector.infer(np.zeros((32, 32, 3), np.uint8), conf=.99) == []
    exported = YOLO(str(checkpoint)).export(format="onnx", imgsz=32, dynamic=False,
                                           simplify=False, nms=False, opset=17, device="cpu")
    deployed = MobilityDetector(exported, device="cpu")
    assert deployed.infer(np.zeros((32, 32, 3), np.uint8), conf=.99) == []


def test_emitter_http_is_metadata_only(monkeypatch):
    import requests
    calls = []
    monkeypatch.setattr(requests, "post", lambda url, **kw: calls.append((url, kw)) or SimpleNamespace(status_code=200))
    emitter = EventEmitter("station", "mobility-test", DISPATCH_CLASSES, sink="http", http_base="http://local")
    emitter.emit("wheelchair", .95, 1, 12, (1, 2, 3, 4))
    url, kwargs = calls[0]
    assert url == "http://local/api/v1/vision/events"
    payload = json.loads(kwargs["data"])
    assert set(payload) == {"schema_version", "event_id", "device_id", "observed_at", "model_version",
                            "label", "confidence", "object_count", "inference_ms", "bbox_xyxy",
                            "is_simulation", "t_capture_ns", "t_infer_ns"}
    assert "files" not in kwargs
    with pytest.raises(TypeError):
        emitter.emit("wheelchair", .95, 1, 12, frame=np.zeros((2, 2, 3)))


@pytest.mark.parametrize("interruption", [[], ["wheelchair", "stroller"], ["ambulant"], ["low"]])
def test_runner_all_inference_passes_gate(monkeypatch, tmp_path, capsys, interruption):
    from edge_vision import run
    frames = [["wheelchair"]] * 4 + [interruption] + [["wheelchair"]] * 6
    index = {"value": 0}
    class FakeDetector:
        model_version = "mock"
        is_simulation = True
        def __init__(self, *args, **kwargs):
            pass
        def warmup(self):
            pass
        def infer(self, frame, conf):
            names = frames[index["value"] - 1]
            return [Detection(0, "wheelchair" if n == "low" else n,
                              .4 if n == "low" else .95, (1, 2, 3, 4)) for n in names]
    class Capture:
        def read(self):
            index["value"] += 1
            return index["value"] <= len(frames), np.zeros((8, 8, 3), np.uint8)
        def release(self):
            pass
    config = tmp_path / "classes.yaml"
    config.write_text(yaml.safe_dump({"names": MOBILITY_CLASSES, "accepted": sorted(DISPATCH_CLASSES)}))
    monkeypatch.setattr(sys, "argv", ["run", "--config", str(config)])
    monkeypatch.delenv("SYS_API_BASE_URL", raising=False)
    monkeypatch.setattr(run, "MobilityDetector", FakeDetector)
    monkeypatch.setattr(run, "open_source", lambda source: Capture())
    emission_frames = []
    original = EventEmitter._deliver
    def capture(self, event):
        emission_frames.append(index["value"])
        original(self, event)
    monkeypatch.setattr(EventEmitter, "_deliver", capture)
    run.main()
    assert emission_frames == [10]
    payloads = [json.loads(line) for line in capsys.readouterr().out.splitlines() if line.startswith("{")]
    assert len(payloads) == 1 and payloads[0]["is_simulation"] is True
