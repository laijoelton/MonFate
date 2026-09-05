"""`load_detector(...)` -> a ready `Detector`.

- Backends are imported lazily so you only install the deps for the one you use.
- `backend="mock"` gives a dependency-free synthetic detector for offline runs.
- `fallback=True` walks TensorRT -> ONNX Runtime -> PyTorch, and within each,
  GPU -> CPU, returning the first that initialises. A missing GPU or a failed
  CUDA/TensorRT init never aborts the pipeline.
"""

from __future__ import annotations

import random
from pathlib import Path

import numpy as np

from .base import Detection, Detector
from .validation import ClassMapError

_EXT_TO_BACKEND = {".pt": "pytorch", ".onnx": "onnx", ".tflite": "tflite", ".engine": "tensorrt"}
# preference order for the fallback chain
_FALLBACK_ORDER = [(".engine", "tensorrt"), (".onnx", "onnx"), (".pt", "pytorch")]


def infer_backend_from_path(weights: str | Path) -> str:
    suffix = Path(weights).suffix.lower()
    if suffix not in _EXT_TO_BACKEND:
        raise ValueError(f"cannot infer backend from {suffix!r}; pass backend= explicitly")
    return _EXT_TO_BACKEND[suffix]


class MockDetector(Detector):
    """Deterministic-ish synthetic detections — no model, no deps beyond numpy.

    Emits one box most frames (so the confirmation gate can reach `accepted`),
    occasionally two or none, cycling through the class list.
    """

    def __init__(self, class_names: list[str] | None = None) -> None:
        self.class_names = class_names or ["object"]
        self._t = 0
        self._rng = random.Random(0)

    def infer(self, frame: np.ndarray, conf: float = 0.25) -> list[Detection]:
        self._t += 1
        h, w = frame.shape[:2] if frame is not None and frame.ndim >= 2 else (480, 640)
        # Each BLOCK: one empty frame (re-arms the gate) then BLOCK-1 frames of a
        # single held class (long enough to latch a gate needing < BLOCK-1
        # consecutive frames). Class advances every block; occasional 2-object
        # frame exercises the "not exactly one object" path.
        BLOCK = 6
        pos = self._t % BLOCK
        block_i = self._t // BLOCK
        n = 0 if pos == 0 else (2 if (pos == 3 and block_i % 4 == 0) else 1)
        out = []
        for k in range(n):
            cid = (block_i + k) % len(self.class_names)
            cx, cy = self._rng.uniform(0.3, 0.7) * w, self._rng.uniform(0.3, 0.7) * h
            bw, bh = 0.2 * w, 0.2 * h
            out.append(Detection(
                class_id=cid, class_name=self.class_names[cid],
                confidence=round(self._rng.uniform(max(conf, 0.4), 0.98), 3),
                xyxy=(cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2),
            ))
        return out


def load_detector(
    weights: str | Path,
    backend: str | None = None,
    class_names: list[str] | None = None,
    imgsz: int = 416,
    device: str = "auto",
    fallback: bool = False,
    class_map: dict[str, str | None] | None = None,
) -> Detector:
    if backend == "mock":
        return MockDetector(class_names)
    if fallback:
        return _load_with_fallback(weights, class_names, imgsz, device, class_map)

    backend = backend or infer_backend_from_path(weights)
    return _construct(backend, weights, class_names, imgsz, device, class_map)


def _construct(backend, weights, class_names, imgsz, device, class_map=None) -> Detector:
    if class_map and backend != "onnx":
        raise ValueError(
            f"checkpoint_class_map is only supported by the onnx backend, not {backend!r}; "
            "ignoring it would silently mislabel detections"
        )
    if backend == "pytorch":
        from .pytorch_backend import PyTorchDetector

        return PyTorchDetector(weights, class_names=class_names, device=device, imgsz=imgsz)
    if backend == "onnx":
        from .onnx_backend import OnnxDetector

        return OnnxDetector(weights, class_names=class_names, imgsz=imgsz, device=device,
                            class_map=class_map)
    if backend == "tflite":
        from .tflite_backend import TFLiteDetector

        return TFLiteDetector(weights, class_names=class_names, imgsz=imgsz)
    if backend == "tensorrt":
        from .tensorrt_backend import TensorRTDetector

        return TensorRTDetector(weights, class_names=class_names, imgsz=imgsz)
    raise ValueError(f"unknown backend {backend!r}")


def _load_with_fallback(weights, class_names, imgsz, device, class_map=None) -> Detector:
    stem = Path(weights).with_suffix("")
    if class_map:
        # A class map describes one specific checkpoint's label order. Walking
        # the fallback chain would apply it to a sibling artifact whose indices
        # may differ, so pin to exactly the file that was asked for.
        candidates = [(infer_backend_from_path(weights), Path(weights))]
    else:
        candidates = [
            (be, stem.with_suffix(ext)) for ext, be in _FALLBACK_ORDER if stem.with_suffix(ext).is_file()
        ]
    if not candidates:  # only the file we were given exists
        candidates = [(infer_backend_from_path(weights), Path(weights))]

    devices = ["cpu"] if device == "cpu" else [device, "cpu"]
    last_err: Exception | None = None
    for be, path in candidates:
        for dev in dict.fromkeys(devices):  # dedupe, preserve order
            try:
                det = _construct(be, path, class_names, imgsz, dev, class_map)
                det.warmup()
                print(f"[vision] inference: {be} on {dev}  ({path.name})")
                return det
            except ClassMapError:
                raise  # A different device cannot repair incompatible class semantics.
            except Exception as exc:  # noqa: BLE001 — any init failure -> next candidate
                last_err = exc
                print(f"[vision] {be}/{dev} unavailable: {exc}")
    raise RuntimeError(f"no working inference backend for {weights!r}; last error: {last_err}")
