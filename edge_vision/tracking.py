"""Preview-only IoU association and EMA boxes; never manufacture gate evidence."""
from __future__ import annotations

from dataclasses import dataclass, replace
from math import isfinite

from .inference.base import Detection


def filter_detections(detections: list[Detection], confidence: float = .60) -> list[Detection]:
    """Enforce the floor even for backends that ignore their conf argument."""
    return [d for d in detections if isfinite(d.confidence) and confidence <= d.confidence <= 1
            and all(isfinite(v) for v in d.xyxy)
            and d.xyxy[2] > d.xyxy[0] and d.xyxy[3] > d.xyxy[1]]


def box_iou(a: tuple, b: tuple) -> float:
    intersection = max(0, min(a[2], b[2])-max(a[0], b[0])) * max(0, min(a[3], b[3])-max(a[1], b[1]))
    union = (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - intersection
    return intersection / union if union > 0 else 0.


@dataclass
class PreviewTrack:
    track_id: int
    detection: Detection
    raw_box: tuple
    hits: int = 1
    missed: int = 0


class BoxSmoother:
    """Class-aware, one-to-one greedy IoU tracking with short visual persistence.

    A new track needs two hits; an established box is held for up to two missed
    frames. These display tracks must not be used by the confirmation gate.
    """
    def __init__(self, alpha: float = .35, iou_threshold: float = .3,
                 max_missed: int = 2, min_hits: int = 2) -> None:
        if not 0 < alpha <= 1 or not 0 < iou_threshold <= 1 or max_missed < 0 or min_hits < 1:
            raise ValueError("invalid smoothing parameters")
        self.alpha, self.iou_threshold = alpha, iou_threshold
        self.max_missed, self.min_hits = max_missed, min_hits
        self._tracks: dict[int, PreviewTrack] = {}
        self._next_id = 0

    def reset(self) -> None:
        self._tracks.clear()

    def update(self, detections: list[Detection]) -> list[PreviewTrack]:
        candidates = sorted((box_iou(t.raw_box, d.xyxy), tid, i)
                            for tid, t in self._tracks.items() for i, d in enumerate(detections)
                            if t.detection.class_name == d.class_name)
        used_tracks, used_detections = set(), set()
        for overlap, tid, i in reversed(candidates):
            if overlap < self.iou_threshold or tid in used_tracks or i in used_detections:
                continue
            track, detection = self._tracks[tid], detections[i]
            coords = tuple((1-self.alpha)*old + self.alpha*new
                           for old, new in zip(track.detection.xyxy, detection.xyxy))
            track.detection = replace(detection, xyxy=coords)
            track.raw_box = detection.xyxy
            track.hits += 1
            track.missed = 0
            used_tracks.add(tid)
            used_detections.add(i)
        for tid in list(self._tracks):
            if tid not in used_tracks:
                track = self._tracks[tid]
                track.missed += 1
                if track.missed > self.max_missed or track.hits < self.min_hits:
                    del self._tracks[tid]
        for i, detection in enumerate(detections):
            if i not in used_detections:
                tid = self._next_id
                self._next_id += 1
                self._tracks[tid] = PreviewTrack(tid, detection, detection.xyxy)
        return [t for t in self._tracks.values() if t.hits >= self.min_hits]
