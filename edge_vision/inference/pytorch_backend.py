"""Ultralytics YOLO backend (.pt). Best for a dev laptop and training parity."""

from __future__ import annotations

from pathlib import Path

import numpy as np

from .base import Detection, Detector
from .validation import ClassMapError, validate_class_names


class PyTorchDetector(Detector):
    def __init__(self, weights: str | Path, class_names: list[str] | None = None, device: str = "auto", imgsz: int = 416):
        from ultralytics import YOLO  # lazy: only needed for this backend

        if not Path(weights).is_file():
            raise FileNotFoundError(weights)
        self._model = YOLO(str(weights))
        if self._model.task != "detect":
            raise ClassMapError("checkpoint must be an object detection model")
        self._imgsz = imgsz
        self._device = None if device == "auto" else device
        self.class_names = validate_class_names(self._model.names, class_names)
        if self._model.model.model[-1].nc != len(self.class_names):
            raise ClassMapError("output head size does not match class map")

    def infer(self, frame: np.ndarray, conf: float = 0.25) -> list[Detection]:
        result = self._model(frame, conf=conf, device=self._device, imgsz=self._imgsz,
                             verbose=False, save=False, save_txt=False, save_crop=False,
                             show=False)[0]
        out: list[Detection] = []
        for box in result.boxes:
            cid = int(box.cls[0])
            out.append(
                Detection(
                    class_id=cid,
                    class_name=self.class_names[cid],
                    confidence=float(box.conf[0]),
                    xyxy=tuple(float(v) for v in box.xyxy[0].tolist()),
                )
            )
        return out
