"""TensorRT backend (.engine) for Jetson.

Loads a serialised engine and runs it with pycuda. The pre/post-processing is
identical to the ONNX backend (same YOLO head), so it reuses that code.

Build an engine first, e.g. with Ultralytics:
    yolo export model=best.pt format=engine device=0 imgsz=416
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from .base import Detection, Detector
from .onnx_backend import _letterbox, _nms


class TensorRTDetector(Detector):
    def __init__(self, weights: str | Path, class_names: list[str] | None = None, imgsz: int = 416):
        import tensorrt as trt  # lazy — only on Jetson / with TensorRT installed
        import pycuda.autoinit  # noqa: F401  (initialises the CUDA context)
        import pycuda.driver as cuda

        self._cuda = cuda
        logger = trt.Logger(trt.Logger.WARNING)
        with open(weights, "rb") as f, trt.Runtime(logger) as rt:
            self._engine = rt.deserialize_cuda_engine(f.read())
        self._ctx = self._engine.create_execution_context()
        self._imgsz = imgsz
        self.class_names = class_names or []

        self._bindings: list[int] = []
        self._host: dict[str, np.ndarray] = {}
        self._dev: dict[str, object] = {}
        for i in range(self._engine.num_bindings):
            name = self._engine.get_binding_name(i)
            shape = tuple(self._engine.get_binding_shape(i))
            size = int(np.prod(shape))
            host = cuda.pagelocked_empty(size, np.float32)
            dev = cuda.mem_alloc(host.nbytes)
            self._bindings.append(int(dev))
            self._host[name] = host
            self._dev[name] = dev
            if self._engine.binding_is_input(i):
                self._in_name, self._in_shape = name, shape
            else:
                self._out_name, self._out_shape = name, shape
        self._stream = cuda.Stream()

    def infer(self, frame: np.ndarray, conf: float = 0.25) -> list[Detection]:
        canvas, r, (dx, dy) = _letterbox(frame, self._imgsz)
        blob = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        blob = np.transpose(blob, (2, 0, 1)).ravel()

        np.copyto(self._host[self._in_name], blob)
        self._cuda.memcpy_htod_async(self._dev[self._in_name], self._host[self._in_name], self._stream)
        self._ctx.execute_async_v2(self._bindings, self._stream.handle)
        self._cuda.memcpy_dtoh_async(self._host[self._out_name], self._dev[self._out_name], self._stream)
        self._stream.synchronize()

        pred = self._host[self._out_name].reshape(self._out_shape)[0]
        if pred.shape[0] < pred.shape[1]:
            pred = pred.T

        boxes_xywh, class_scores = pred[:, :4], pred[:, 4:]
        class_ids = class_scores.argmax(axis=1)
        scores = class_scores.max(axis=1)
        m = scores >= conf
        boxes_xywh, class_ids, scores = boxes_xywh[m], class_ids[m], scores[m]

        cx, cy, bw, bh = boxes_xywh.T
        xyxy = np.stack(
            [(cx - bw / 2 - dx) / r, (cy - bh / 2 - dy) / r,
             (cx + bw / 2 - dx) / r, (cy + bh / 2 - dy) / r],
            axis=1,
        )
        out: list[Detection] = []
        for cid in np.unique(class_ids):
            idx = np.where(class_ids == cid)[0]
            for k in _nms(xyxy[idx], scores[idx], 0.45):
                j = idx[k]
                name = self.class_names[cid] if cid < len(self.class_names) else str(int(cid))
                out.append(
                    Detection(int(cid), name, float(scores[j]), tuple(float(v) for v in xyxy[j]))
                )
        return out
