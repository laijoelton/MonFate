"""Edge detection/classification pipeline: camera -> inference -> gate -> emitter."""

from .inference.base import Detection, Detector
from .inference.factory import MockDetector, load_detector
from .gate import ConsecutiveDetectionGate, GateResult

__all__ = [
    "Detection",
    "Detector",
    "MockDetector",
    "load_detector",
    "ConsecutiveDetectionGate",
    "GateResult",
]
