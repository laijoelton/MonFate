"""ONNX Runtime backend.

Handles two export layouts, auto-detected from the ONNX ``metadata_props``:

  * ``cxcywh_obj_cls_pixels`` — our proprietary CustomDetector
    (edge_vision/models/custom_detector.py). Output ``(1, N, 5 + C)`` =
    ``[cx, cy, w, h  (input pixels), obj_logit, cls_logits...]``, trained on a
    plain stretch-resize to ``img_size``.
  * YOLOv8/YOLO11-style — output ``(1, 4 + C, N)`` (or its transpose),
    class scores only, letterboxed input.

Post-processing (both): sigmoid where needed, ``score = obj * max(cls)``,
confidence threshold, un-normalise coords to the ORIGINAL frame, vectorised
per-class NMS. Returns ``Detection`` objects straight into ``run.py``'s loop.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from .base import Detection, Detector
from .validation import ClassMapError, build_class_translation, validate_class_names


# --------------------------------------------------------------------------- #
# resize helpers
# --------------------------------------------------------------------------- #
def _letterbox(img: np.ndarray, new: int) -> tuple[np.ndarray, float, tuple[int, int]]:
    h, w = img.shape[:2]
    r = min(new / h, new / w)
    nh, nw = int(round(h * r)), int(round(w * r))
    resized = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_LINEAR)
    canvas = np.full((new, new, 3), 114, dtype=np.uint8)
    top, left = (new - nh) // 2, (new - nw) // 2
    canvas[top : top + nh, left : left + nw] = resized
    return canvas, r, (left, top)


def _stretch(img: np.ndarray, new: int) -> tuple[np.ndarray, float, float]:
    h, w = img.shape[:2]
    return cv2.resize(img, (new, new), interpolation=cv2.INTER_LINEAR), new / w, new / h


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(x, -30, 30)))


def _nms(boxes: np.ndarray, scores: np.ndarray, iou_thres: float) -> list[int]:
    if len(boxes) == 0:
        return []
    x1, y1, x2, y2 = boxes.T
    areas = (x2 - x1) * (y2 - y1)
    order = scores.argsort()[::-1]
    keep: list[int] = []
    while order.size > 0:
        i = order[0]
        keep.append(int(i))
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        inter = np.maximum(0, xx2 - xx1) * np.maximum(0, yy2 - yy1)
        iou = inter / (areas[i] + areas[order[1:]] - inter + 1e-9)
        order = order[1:][iou <= iou_thres]
    return keep


# --------------------------------------------------------------------------- #
class OnnxDetector(Detector):
    def __init__(
        self,
        weights: str | Path,
        class_names: list[str] | None = None,
        imgsz: int = 416,
        device: str = "auto",
        iou_thres: float = 0.45,
        class_map: dict[str, str | None] | None = None,
    ):
        import onnxruntime as ort  # lazy

        providers = ["CPUExecutionProvider"]
        if device != "cpu" and "CUDAExecutionProvider" in ort.get_available_providers():
            providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
        self._sess = ort.InferenceSession(str(weights), providers=providers)
        self._input = self._sess.get_inputs()[0].name
        self._iou = iou_thres

        meta = self._sess.get_modelmeta().custom_metadata_map or {}
        self._layout = meta.get("layout", "yolo")
        self._imgsz = int(meta.get("img_size", imgsz))
        raw_names = meta.get("names") or meta.get("classes")
        if class_map:
            # Third-party checkpoint: validate its own labels, then translate
            # through the declared map. `self.class_names` stays in checkpoint
            # order because decoding indexes it by raw class id; `_translation`
            # converts to contract labels at emit time.
            checkpoint_names = validate_class_names(raw_names, None)
            self._translation = build_class_translation(
                checkpoint_names, class_names or checkpoint_names, class_map
            )
            self.class_names = checkpoint_names
        else:
            self.class_names = validate_class_names(raw_names, class_names)
            self._translation = None
        if self._layout not in {"yolo", "cxcywh_obj_cls_pixels"}:
            raise ClassMapError(f"unsupported output layout: {self._layout}")
        outputs = self._sess.get_outputs()
        columns = len(self.class_names) + (5 if self._layout.startswith("cxcywh_obj_cls") else 4)
        if len(outputs) != 1 or len(outputs[0].shape) != 3:
            raise ClassMapError("expected one raw detection head output")
        dims = outputs[0].shape[1:]
        if all(isinstance(d, int) for d in dims) and (
            dims[1] != columns if self._layout.startswith("cxcywh_obj_cls") else columns not in dims
        ):
            raise ClassMapError("output head size does not match class map")
        shape = self._sess.get_inputs()[0].shape
        if len(shape) != 4 or shape[1] != 3:
            raise ClassMapError("expected NCHW RGB input")
        if isinstance(shape[2], int) and isinstance(shape[3], int):
            if shape[2] != shape[3]:
                raise ClassMapError("expected square model input")
            self._imgsz = shape[2]

    # -- preprocessing ---------------------------------------------------- #
    def _preprocess(self, frame: np.ndarray):
        if self._layout.startswith("cxcywh_obj_cls"):
            canvas, sx, sy = _stretch(frame, self._imgsz)
            info = ("stretch", sx, sy)
        else:
            canvas, r, (dx, dy) = _letterbox(frame, self._imgsz)
            info = ("letterbox", r, dx, dy)
        blob = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        return np.transpose(blob, (2, 0, 1))[None], info

    def _to_frame_xyxy(self, cx, cy, bw, bh, info) -> np.ndarray:
        x1, y1, x2, y2 = cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2
        if info[0] == "stretch":
            _, sx, sy = info
            return np.stack([x1 / sx, y1 / sy, x2 / sx, y2 / sy], axis=1)
        _, r, dx, dy = info
        return np.stack([(x1 - dx) / r, (y1 - dy) / r, (x2 - dx) / r, (y2 - dy) / r], axis=1)

    # -- inference ------------------------------------------------------- #
    def infer(self, frame: np.ndarray, conf: float = 0.25) -> list[Detection]:
        blob, info = self._preprocess(frame)
        raw = self._sess.run(None, {self._input: blob})[0][0]  # (N, K) or (K, N)
        columns = len(self.class_names) + (5 if self._layout.startswith("cxcywh_obj_cls") else 4)
        if raw.ndim != 2:
            raise ClassMapError("expected raw detection head output")
        if self._layout.startswith("cxcywh_obj_cls"):
            if raw.shape[1] != columns:
                raise ClassMapError("output head size does not match class map")
        elif raw.shape[0] == columns:
            raw = raw.T
        elif raw.shape[1] != columns:
            raise ClassMapError("output head size does not match class map")

        if self._layout.startswith("cxcywh_obj_cls"):
            pred = raw  # (N, 5 + C)
            boxes_xywh = pred[:, :4]
            obj = _sigmoid(pred[:, 4])
            cls = _sigmoid(pred[:, 5:])
            class_ids = cls.argmax(axis=1)
            scores = obj * cls.max(axis=1)
        else:
            pred = raw
            boxes_xywh = pred[:, :4]
            cls = pred[:, 4:]
            class_ids = cls.argmax(axis=1)
            scores = cls.max(axis=1)

        m = scores >= conf
        boxes_xywh, class_ids, scores = boxes_xywh[m], class_ids[m], scores[m]
        if len(scores) == 0:
            return []

        cx, cy, bw, bh = boxes_xywh.T
        xyxy = self._to_frame_xyxy(cx, cy, bw, bh, info)
        h, w = frame.shape[:2]
        xyxy[:, [0, 2]] = xyxy[:, [0, 2]].clip(0, w)
        xyxy[:, [1, 3]] = xyxy[:, [1, 3]].clip(0, h)

        out: list[Detection] = []
        for cid in np.unique(class_ids):
            name = self._label_for(int(cid))
            if name is None:
                continue  # class deliberately discarded by the class map
            idx = np.where(class_ids == cid)[0]
            for k in _nms(xyxy[idx], scores[idx], self._iou):
                j = idx[k]
                out.append(
                    Detection(int(cid), name, float(scores[j]), tuple(float(v) for v in xyxy[j]))
                )
        return out

    def _label_for(self, cid: int) -> str | None:
        """Contract label for a raw checkpoint class id, or None to discard."""
        if self._translation is not None:
            return self._translation[cid] if cid < len(self._translation) else None
        return self.class_names[cid] if cid < len(self.class_names) else str(cid)
