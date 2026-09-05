"""TFLite / LiteRT backend (.tflite) for Coral, Raspberry Pi, Grove Vision AI.

Shares the YOLO letterbox + NMS postprocessing with the ONNX backend. Handles
both float32 and int8-quantised models (reads the quant params from the tensor
details).
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from .base import Detection, Detector
from .onnx_backend import _letterbox, _nms


class TFLiteDetector(Detector):
    def __init__(self, weights: str | Path, class_names: list[str] | None = None, imgsz: int = 416):
        try:
            from tflite_runtime.interpreter import Interpreter  # lightweight, for edge targets
        except ModuleNotFoundError:  # fall back to full TF on a dev machine
            from tensorflow.lite import Interpreter

        self._interp = Interpreter(model_path=str(weights))
        self._interp.allocate_tensors()
        self._in = self._interp.get_input_details()[0]
        self._out = self._interp.get_output_details()[0]
        self._imgsz = int(self._in["shape"][1]) or imgsz
        self.class_names = class_names or []

    def _dequantize(self, arr: np.ndarray, detail: dict) -> np.ndarray:
        scale, zero = detail.get("quantization", (0.0, 0))
        return (arr.astype(np.float32) - zero) * scale if scale else arr.astype(np.float32)

    def infer(self, frame: np.ndarray, conf: float = 0.25) -> list[Detection]:
        canvas, r, (dx, dy) = _letterbox(frame, self._imgsz)
        img = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB)

        if self._in["dtype"] == np.uint8:
            blob = img[None].astype(np.uint8)
        else:
            blob = (img[None].astype(np.float32) / 255.0)

        self._interp.set_tensor(self._in["index"], blob)
        self._interp.invoke()
        pred = self._dequantize(self._interp.get_tensor(self._out["index"]), self._out)[0]
        if pred.shape[0] < pred.shape[1]:
            pred = pred.T

        boxes_xywh, class_scores = pred[:, :4], pred[:, 4:]
        # some tflite exports give normalised xywh in [0,1]
        if boxes_xywh.max() <= 1.5:
            boxes_xywh = boxes_xywh * self._imgsz
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
