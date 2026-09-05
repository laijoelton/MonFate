"""The contract every inference backend implements.

`run.py` and everything downstream only ever sees `Detection` objects, so the
choice of PyTorch / ONNX / TFLite / TensorRT is invisible past this module.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class Detection:
    """One detected object in one frame. Coordinates are pixels in that frame."""

    class_id: int
    class_name: str
    confidence: float
    xyxy: tuple[float, float, float, float]  # (x1, y1, x2, y2)

    @property
    def center(self) -> tuple[float, float]:
        x1, y1, x2, y2 = self.xyxy
        return (x1 + x2) / 2.0, (y1 + y2) / 2.0

    @property
    def area(self) -> float:
        x1, y1, x2, y2 = self.xyxy
        return max(0.0, x2 - x1) * max(0.0, y2 - y1)


class Detector(ABC):
    """A loaded model ready to run on frames.

    Implementations live in the sibling `*_backend.py` files and are constructed
    through `factory.load_detector(...)`.
    """

    #: ordered class names, index == class_id
    class_names: list[str]

    @abstractmethod
    def infer(self, frame: np.ndarray, conf: float = 0.25) -> list[Detection]:
        """Run one forward pass on a BGR uint8 HxWx3 frame."""
        raise NotImplementedError

    def warmup(self, height: int = 480, width: int = 640) -> None:
        """Optional: run a dummy frame so the first real inference isn't slow."""
        self.infer(np.zeros((height, width, 3), dtype=np.uint8))

    def __call__(self, frame: np.ndarray, conf: float = 0.25) -> list[Detection]:
        return self.infer(frame, conf=conf)
