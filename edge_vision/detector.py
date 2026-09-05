"""Mobility detector selection. Missing weights are explicitly simulated."""
from __future__ import annotations

import warnings
from pathlib import Path

import numpy as np

from .inference.base import Detection, Detector
from .inference.factory import MockDetector, load_detector
from .inference.validation import validate_class_names

MOBILITY_CLASSES = ["wheelchair", "stroller", "mobility_aid", "ambulant", "other"]
DISPATCH_CLASSES = set(MOBILITY_CLASSES[:3])


class MobilityDetector(Detector):
    def __init__(self, weights: str | Path, *, simulation: bool = False,
                 backend: str | None = None, class_names: list[str] | None = None,
                 imgsz: int = 416, device: str = "auto", fallback: bool = True) -> None:
        self.class_names = validate_class_names(
            MOBILITY_CLASSES if class_names is None else class_names, MOBILITY_CLASSES)
        self.is_simulation = simulation or backend == "mock" or not Path(weights).is_file()
        if self.is_simulation:
            if not simulation and backend != "mock":
                warnings.warn(f"weights missing: {weights}; using simulated detections", RuntimeWarning)
            self._detector = MockDetector(self.class_names)
            self.model_version = "mock"
        else:
            # Only backends with checkpoint class-map validation may dispatch.
            selected = backend or {".pt": "pytorch", ".onnx": "onnx"}.get(Path(weights).suffix.lower())
            if selected not in {"pytorch", "onnx"}:
                raise ValueError("mobility deployment requires validated PyTorch or ONNX weights")
            # Device fallback stays on the supplied artifact; sibling files may
            # be stale or from another training run.
            try:
                self._detector = load_detector(weights, backend=selected, class_names=self.class_names,
                                               imgsz=imgsz, device=device)
            except (RuntimeError, OSError):
                if not fallback or device == "cpu":
                    raise
                self._detector = load_detector(weights, backend=selected, class_names=self.class_names,
                                               imgsz=imgsz, device="cpu")
            import hashlib
            hasher = hashlib.sha256()
            with Path(weights).open("rb") as checkpoint:
                for chunk in iter(lambda: checkpoint.read(1024 * 1024), b""):
                    hasher.update(chunk)
            digest = hasher.hexdigest()[:16]
            self.model_version = f"mobility-{digest}"

    def infer(self, frame: np.ndarray, conf: float = 0.25) -> list[Detection]:
        return self._detector.infer(frame, conf=conf)
