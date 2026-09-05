"""Opt-in local approximate age overlay. No identities, gender, storage or sinks."""
from __future__ import annotations

from pathlib import Path

import numpy as np

from .download_age_models import DEFAULT_MODEL_DIR, MODEL_URLS
from .inference.base import Detection
from .tracking import BoxSmoother, filter_detections

AGE_BRACKETS = ("0-2", "4-6", "8-12", "15-20", "25-32", "38-43", "48-53", "60-100")
AGE_MEAN = (78.4263377603, 87.7689143744, 114.895847746)


class AgePreview:
    """Face locations every frame; age inference every few frames, on CPU.

    The application cache contains only eight-bin probabilities and boxes.
    Crops and estimates are never saved or passed to an event/network sink.
    """
    def __init__(self, model_dir: Path = DEFAULT_MODEL_DIR, interval: int = 5) -> None:
        import cv2

        if interval < 1:
            raise ValueError("age interval must be positive")
        missing = [name for name in MODEL_URLS if not (model_dir / name).is_file()]
        if missing:
            raise FileNotFoundError("age preview models missing; run python -m edge_vision.download_age_models")
        if not hasattr(cv2.dnn, "readNetFromCaffe"):
            raise RuntimeError("age preview requires opencv-python>=4.8,<5 (Caffe support)")
        self._face = cv2.dnn.readNetFromTensorflow(str(model_dir / "opencv_face_detector_uint8.pb"),
                                                 str(model_dir / "opencv_face_detector.pbtxt"))
        self._age = cv2.dnn.readNetFromCaffe(str(model_dir / "age_deploy.prototxt"),
                                           str(model_dir / "age_net.caffemodel"))
        for net in (self._face, self._age):
            net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
            net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
        self._interval = interval
        self._frame = 0
        self._shape = None
        self._tracker = BoxSmoother(min_hits=1, max_missed=0)
        self._scores: dict[int, np.ndarray] = {}

    def render(self, frame: np.ndarray) -> None:
        """Draw age estimates in-place on the local preview only."""
        import cv2

        h, w = frame.shape[:2]
        if self._shape != (h, w):
            self._tracker.reset()
            self._scores.clear()
            self._shape = (h, w)
        self._frame += 1
        self._face.setInput(cv2.dnn.blobFromImage(frame, 1., (300, 300), (104, 117, 123), swapRB=True))
        output = self._face.forward().reshape(-1, 7)
        detections = []
        for row in output:
            if not np.isfinite(row).all() or row[2] < .7:
                continue
            x1, y1, x2, y2 = row[3:7] * [w, h, w, h]
            coords = (max(0., x1), max(0., y1), min(float(w), x2), min(float(h), y2))
            if coords[2]-coords[0] >= 20 and coords[3]-coords[1] >= 20:
                detections.append(Detection(0, "face", float(row[2]), coords))
        detections = filter_detections(detections, .7)
        boxes = [[d.xyxy[0], d.xyxy[1], d.xyxy[2]-d.xyxy[0], d.xyxy[3]-d.xyxy[1]] for d in detections]
        keep = cv2.dnn.NMSBoxes(boxes, [d.confidence for d in detections], .7, .4) if boxes else []
        tracks = self._tracker.update([detections[int(i)] for i in np.asarray(keep).reshape(-1)[:4]])
        self._scores = {t.track_id: self._scores[t.track_id] for t in tracks if t.track_id in self._scores}
        overlays = []
        # Finish all network reads before drawing anything on their input.
        for track in tracks:
            if track.track_id not in self._scores or self._frame % self._interval == 0:
                x1, y1, x2, y2 = map(int, track.raw_box)
                pad = round(.15 * max(x2-x1, y2-y1))
                crop = frame[max(0, y1-pad):min(h, y2+pad), max(0, x1-pad):min(w, x2+pad)]
                if not crop.size:
                    continue
                self._age.setInput(cv2.dnn.blobFromImage(crop, 1., (227, 227), AGE_MEAN, swapRB=False))
                scores = self._age.forward().reshape(-1)
                if scores.size != 8 or not np.isfinite(scores).all() or (scores < 0).any() or scores.sum() <= 0:
                    self._scores.pop(track.track_id, None)
                    continue
                scores = scores / scores.sum()
                previous = self._scores.get(track.track_id)
                self._scores[track.track_id] = scores if previous is None else .6*previous + .4*scores
            scores = self._scores.get(track.track_id)
            label = (f"Age approx. {AGE_BRACKETS[int(scores.argmax())]}" if scores is not None and scores.max() >= .4
                     else "Age uncertain")
            overlays.append((track.detection.xyxy, label))
        for box, label in overlays:
            x1, y1, x2, y2 = map(int, box)
            cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 200, 80), 1)
            cv2.putText(frame, label, (x1, max(18, y1-6)), cv2.FONT_HERSHEY_SIMPLEX, .5, (255, 200, 80), 1)
