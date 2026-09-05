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
                 imgsz: int = 416, device: str = "auto", fallback: bool = True,
                 class_map: dict[str, str | None] | None = None) -> None:
        self.class_names = validate_class_names(
            MOBILITY_CLASSES if class_names is None else class_names, MOBILITY_CLASSES)
        # The hosted backend addresses a model id, not a path on disk, so the
        # missing-file check below must not mistake it for absent weights and
        # silently downgrade a real deployment to simulated detections.
        self._hosted = backend == "roboflow"
        self.is_simulation = simulation or backend == "mock" or (
            not self._hosted and not Path(weights).is_file()
        )
        if self.is_simulation:
            if not simulation and backend != "mock":
                warnings.warn(f"weights missing: {weights}; using simulated detections", RuntimeWarning)
            self._detector = MockDetector(self.class_names)
            self.model_version = "mock"
        else:
            # Only backends that validate their class map may dispatch.
            selected = backend or {".pt": "pytorch", ".onnx": "onnx"}.get(Path(weights).suffix.lower())
            if selected not in {"pytorch", "onnx", "roboflow"}:
                raise ValueError(
                    "mobility deployment requires validated PyTorch or ONNX weights, "
                    "or --backend roboflow"
                )
            if class_map and selected not in {"onnx", "roboflow"}:
                raise ValueError("checkpoint_class_map requires the onnx or roboflow backend")
            # Device fallback stays on the supplied artifact; sibling files may
            # be stale or from another training run.
            try:
                self._detector = load_detector(weights, backend=selected, class_names=self.class_names,
                                               imgsz=imgsz, device=device, class_map=class_map)
            except (RuntimeError, OSError):
                if not fallback or device == "cpu":
                    raise
                self._detector = load_detector(weights, backend=selected, class_names=self.class_names,
                                               imgsz=imgsz, device="cpu", class_map=class_map)
            if self._hosted:
                # No local artifact to fingerprint. Record the hosted model id
                # instead — it is versioned upstream (project/version), so an
                # event still names exactly what produced it, and the `hosted:`
                # prefix keeps it distinguishable from a local checkpoint hash.
                self.model_version = f"hosted:{weights}"
            else:
                import hashlib
                hasher = hashlib.sha256()
                with Path(weights).open("rb") as checkpoint:
                    for chunk in iter(lambda: checkpoint.read(1024 * 1024), b""):
                        hasher.update(chunk)
                digest = hasher.hexdigest()[:16]
                self.model_version = f"mobility-{digest}"

    def infer(self, frame: np.ndarray, conf: float = 0.25) -> list[Detection]:
        return self._detector.infer(frame, conf=conf)
