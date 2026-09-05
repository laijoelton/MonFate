"""Ultralytics YOLO backend (.pt). Best for a dev laptop and training parity."""

from __future__ import annotations

from pathlib import Path

import numpy as np

from .base import Detection, Detector


class PyTorchDetector(Detector):
    def __init__(self, weights: str | Path, class_names: list[str] | None = None, device: str = "auto"):
        from ultralytics import YOLO  # lazy: only needed for this backend

        self._model = YOLO(str(weights))
        self._device = None if device == "auto" else device
        # Ultralytics carries its own class map; prefer it unless overridden.
        self.class_names = class_names or [
            self._model.names[i] for i in sorted(self._model.names)
        ]

    def infer(self, frame: np.ndarray, conf: float = 0.25) -> list[Detection]:
        result = self._model(frame, conf=conf, device=self._device, verbose=False)[0]
        out: list[Detection] = []
        for box in result.boxes:
            cid = int(box.cls[0])
            out.append(
                Detection(
                    class_id=cid,
                    class_name=result.names.get(cid, str(cid)),
                    confidence=float(box.conf[0]),
                    xyxy=tuple(float(v) for v in box.xyxy[0].tolist()),
                )
            )
        return out
