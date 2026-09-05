import json
from types import SimpleNamespace

import pytest
import yaml
from PIL import Image

from edge_vision.detector import MOBILITY_CLASSES
from edge_vision.finetune import train, validate_dataset


@pytest.fixture
def dataset(tmp_path):
    for i, split in enumerate(("train", "val")):
        images = tmp_path / "images" / split
        labels = tmp_path / "labels" / split
        images.mkdir(parents=True)
        labels.mkdir(parents=True)
        Image.new("RGB", (32, 32), (i * 100, 0, 0)).save(images / "sample.png")
        (labels / "sample.txt").write_text("0 .2 .2 .1 .1\n1 .5 .5 .2 .2\n2 .8 .8 .1 .1\n")
    path = tmp_path / "data.yaml"
    path.write_text(yaml.safe_dump({"names": MOBILITY_CLASSES, "train": "images/train", "val": "images/val"}))
    return path


def test_dataset_valid(dataset):
    cfg = validate_dataset(dataset)
    assert cfg["names"] == MOBILITY_CLASSES
    assert cfg["path"] == str(dataset.parent)


@pytest.mark.parametrize("row", ["5 .5 .5 .2 .2", "0 nan .5 .2 .2", "0 .5 .5 -1 .2", "0 .99 .5 .5 .5", "0 .5 .5", "0.5 .5 .5 .2 .2"])
def test_invalid_annotations(dataset, row):
    (dataset.parent / "labels/train/sample.txt").write_text(row)
    with pytest.raises(ValueError):
        validate_dataset(dataset)


def test_missing_annotation(dataset):
    (dataset.parent / "labels/train/sample.txt").rename(dataset.parent / "moved.txt")
    with pytest.raises(ValueError, match="missing annotation"):
        validate_dataset(dataset)


def test_duplicate_train_validation_image(dataset):
    source = dataset.parent / "images/train/sample.png"
    (dataset.parent / "images/val/sample.png").write_bytes(source.read_bytes())
    with pytest.raises(ValueError, match="duplicate"):
        validate_dataset(dataset)


def test_missing_dispatch_class(dataset):
    (dataset.parent / "labels/train/sample.txt").write_text("0 .5 .5 .2 .2")
    with pytest.raises(ValueError, match="all three"):
        validate_dataset(dataset)


def test_training_best_checkpoint_metrics_export(dataset, monkeypatch):
    import ultralytics
    from edge_vision.inference.onnx_backend import OnnxDetector
    calls = []
    class FakeYOLO:
        task = "detect"
        names = dict(enumerate(MOBILITY_CLASSES))
        def __init__(self, path):
            calls.append(("load", str(path)))
            self.trainer = SimpleNamespace(best=dataset.parent / "best.pt")
        def train(self, **kwargs):
            calls.append(("train", kwargs))
        def val(self, **kwargs):
            calls.append(("val", kwargs))
            return SimpleNamespace(box=SimpleNamespace(mp=.8, mr=.7, map50=.6, map=.5,
                                                       maps=[.5]*5, ap_class_index=[0, 1, 2]))
        def export(self, **kwargs):
            calls.append(("export", kwargs))
            return dataset.parent / "best.onnx"
    monkeypatch.setattr(ultralytics, "YOLO", FakeYOLO)
    monkeypatch.setattr(OnnxDetector, "__init__", lambda self, *a, **kw: None)
    monkeypatch.setattr(OnnxDetector, "warmup", lambda self: calls.append(("warmup", None)))
    output = dataset.parent / "run"
    report = train(dataset, epochs=1, output=output)
    assert calls[0] == ("load", "yolov8n.pt")
    assert calls[1][1]["freeze"] == 10
    assert calls[2] == ("load", str(dataset.parent / "best.pt"))
    assert calls[3][1]["split"] == "val"
    assert calls[4][1]["nms"] is False
    assert calls[5][0] == "warmup"
    assert json.loads((output / "metrics.json").read_text()) == report
    assert report["per_class_map50_95"]["ambulant"] is None
