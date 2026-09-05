"""Train YOLOv8n on local mobility annotations, evaluate, and export raw ONNX.

Run: python -m edge_vision.finetune --data /path/to/data.yaml
Data must use images/{train,val} and labels/{train,val}, with one YOLO label
file per image (empty files explicitly denote negative examples).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import yaml

from .detector import MOBILITY_CLASSES
from .inference.validation import validate_class_names


def validate_dataset(path: str | Path) -> dict:
    """Validate local detection labels before importing a training runtime."""
    from PIL import Image

    path = Path(path).resolve()
    cfg = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(cfg, dict):
        raise ValueError("dataset YAML must be a mapping")
    names = validate_class_names(cfg.get("names"), MOBILITY_CLASSES)
    if "nc" in cfg and cfg["nc"] != len(names):
        raise ValueError("nc must match names")
    root = (path.parent / cfg.get("path", ".")).resolve()
    normalized = {"path": str(root), "names": names}
    hashes: set[str] = set()
    for split in ("train", "val"):
        value = cfg.get(split)
        if not isinstance(value, str) or not value:
            raise ValueError(f"{split} must name a local images directory")
        folder = (root / value).resolve()
        if not folder.is_dir() or folder.parent.name != "images":
            raise ValueError(f"{split} must be a directory at images/{split}")
        images = sorted(p for p in folder.rglob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp"})
        if not images:
            raise ValueError(f"{split} contains no supported images")
        counts = [0] * len(names)
        split_hashes: set[str] = set()
        for image in images:
            with Image.open(image) as decoded:
                decoded.verify()
            digest = hashlib.sha256(image.read_bytes()).hexdigest()
            if digest in hashes:
                raise ValueError("train/val contain duplicate image content")
            split_hashes.add(digest)
            label = folder.parent.parent / "labels" / folder.name / image.relative_to(folder).with_suffix(".txt")
            if not label.is_file():
                raise ValueError(f"missing annotation: {label}")
            for line in label.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                values = line.split()
                if len(values) != 5:
                    raise ValueError(f"expected class cx cy width height: {label}")
                cid, x, y, width, height = map(float, values)
                if not all(math.isfinite(v) for v in (cid, x, y, width, height)):
                    raise ValueError(f"nonfinite annotation: {label}")
                if not cid.is_integer() or not 0 <= cid < len(names):
                    raise ValueError(f"invalid class ID: {label}")
                if not (0 < width <= 1 and 0 < height <= 1 and
                        width / 2 <= x <= 1 - width / 2 and height / 2 <= y <= 1 - height / 2):
                    raise ValueError(f"box must lie within normalized image bounds: {label}")
                counts[int(cid)] += 1
        if any(counts[i] == 0 for i in range(3)):
            raise ValueError(f"{split} must contain all three dispatch classes")
        hashes.update(split_hashes)
        normalized[split] = str(folder)
    return normalized


def train(data: str | Path, *, base: str = "yolov8n.pt", epochs: int = 50,
          imgsz: int = 416, batch: int = 8, freeze: int = 10,
          device: str = "cpu", output: str | Path = "edge_vision/runs/mobility",
          export: bool = True) -> dict:
    """Transfer pretrained weights; report held-out validation metrics."""
    if epochs < 1 or batch < 1 or freeze < 0 or imgsz < 32 or imgsz % 32:
        raise ValueError("positive epochs/batch, nonnegative freeze, and imgsz multiple of 32 required")
    cfg = validate_dataset(data)
    from ultralytics import YOLO

    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    dataset = output / "validated-data.yaml"
    dataset.write_text(yaml.safe_dump(cfg), encoding="utf-8")
    model = YOLO(base)
    if model.task != "detect":
        raise ValueError("base checkpoint must be a detection model")
    model.train(data=str(dataset), epochs=epochs, imgsz=imgsz, batch=batch,
                freeze=freeze, device=device, project=str(output), name="train",
                seed=0, deterministic=True, workers=0, plots=False)
    # Evaluate and export the best checkpoint, not the final epoch in memory.
    best = Path(model.trainer.best)
    trained = YOLO(str(best))
    validate_class_names(trained.names, MOBILITY_CLASSES)
    metrics = trained.val(data=str(dataset), split="val", imgsz=imgsz,
                          device=device, plots=False, save_json=False)
    report = {
        "checkpoint": str(best), "classes": MOBILITY_CLASSES,
        "precision": float(metrics.box.mp), "recall": float(metrics.box.mr),
        "map50": float(metrics.box.map50), "map50_95": float(metrics.box.map),
        "per_class_map50_95": {
            name: float(metrics.box.maps[i]) if i in metrics.box.ap_class_index else None
            for i, name in enumerate(MOBILITY_CLASSES)
        },
    }
    if export:
        report["onnx"] = str(trained.export(format="onnx", imgsz=imgsz,
                                            dynamic=False, simplify=False, nms=False,
                                            opset=17, device=device))
        from .inference.onnx_backend import OnnxDetector
        OnnxDetector(report["onnx"], class_names=MOBILITY_CLASSES, device="cpu").warmup()
    (output / "metrics.json").write_text(json.dumps(report, indent=2, allow_nan=False), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", required=True, type=Path)
    parser.add_argument("--base", default="yolov8n.pt")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--imgsz", type=int, default=416)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--freeze", type=int, default=10)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--output", type=Path, default=Path("edge_vision/runs/mobility"))
    parser.add_argument("--no-export", dest="export", action="store_false")
    print(json.dumps(train(**vars(parser.parse_args())), indent=2))


if __name__ == "__main__":
    main()
