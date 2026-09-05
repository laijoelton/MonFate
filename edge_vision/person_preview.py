"""Local person-to-mobility association, separate from dispatch detections."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .inference.base import Detection
from .tracking import BoxSmoother, PreviewTrack, filter_detections

DEFAULT_PERSON_WEIGHTS = Path(__file__).resolve().parent / "models" / "person_yolov8n.pt"


@dataclass(frozen=True)
class RiderLink:
    person: PreviewTrack
    aid: PreviewTrack
    overlap: float

    @property
    def label(self) -> str:
        return "Wheelchair User" if self.aid.detection.class_name == "wheelchair" else "Active Mobility Rider"


def associate_riders(people: list[PreviewTrack], aids: list[PreviewTrack],
                     minimum_overlap: float = .35) -> list[RiderLink]:
    """Greedily match fresh boxes by intersection / smaller box area.

    Containment scores 1 even when person and chair boxes differ greatly in
    size. Minor edge contact is ignored. One person and one aid per link;
    this geometric cue does not establish identity or medical status.
    """
    if not 0 < minimum_overlap <= 1:
        raise ValueError("minimum_overlap must be in (0, 1]")
    candidates = []
    for pi, person in enumerate(people):
        if person.missed or person.detection.class_name != "person":
            continue
        for ai, aid in enumerate(aids):
            if aid.missed or aid.detection.class_name not in {"wheelchair", "mobility_aid"}:
                continue
            a, b = person.raw_box, aid.raw_box
            smaller = min((a[2]-a[0])*(a[3]-a[1]), (b[2]-b[0])*(b[3]-b[1]))
            intersection = max(0, min(a[2], b[2])-max(a[0], b[0])) * max(0, min(a[3], b[3])-max(a[1], b[1]))
            score = intersection / smaller if smaller > 0 else 0
            if score >= minimum_overlap:
                candidates.append((score, pi, ai))
    used_people, used_aids, links = set(), set(), []
    for score, pi, ai in sorted(candidates, key=lambda item: (-item[0], item[1], item[2])):
        if pi not in used_people and ai not in used_aids:
            links.append(RiderLink(people[pi], aids[ai], score))
            used_people.add(pi)
            used_aids.add(ai)
    return links


class PersonPreview:
    def __init__(self, weights: Path = DEFAULT_PERSON_WEIGHTS, *, device: str = "cpu",
                 imgsz: int = 416, confidence: float = .6, alpha: float = .35) -> None:
        from .inference.pytorch_backend import PyTorchDetector

        if not Path(weights).is_file():
            raise FileNotFoundError(f"person preview weights missing: {weights}; supply a pretrained YOLOv8n "
                                    "checkpoint with --person-weights or use --no-person-association")
        self._detector = PyTorchDetector(weights, device=device, imgsz=imgsz)
        if "person" not in self._detector.class_names:
            raise ValueError("person preview checkpoint must contain the person class")
        self._confidence = confidence
        self._smoother = BoxSmoother(alpha=alpha)
        self._shape = None

    def detect(self, frame: np.ndarray) -> list[PreviewTrack]:
        if frame.shape != self._shape:
            self._smoother.reset()
            self._shape = frame.shape
        people = [d for d in self._detector.infer(frame, conf=self._confidence) if d.class_name == "person"]
        return self._smoother.update(filter_detections(people, self._confidence))

    @staticmethod
    def draw(frame: np.ndarray, people: list[PreviewTrack], aids: list[PreviewTrack]) -> None:
        import cv2

        for track in people:
            x1, y1, x2, y2 = map(int, track.detection.xyxy)
            color = (140, 140, 140) if track.missed else (255, 180, 50)
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 1)
            cv2.putText(frame, "Person" + (" (held)" if track.missed else ""),
                        (x1, max(18, y1-6)), cv2.FONT_HERSHEY_SIMPLEX, .5, color, 1)
        for link in associate_riders(people, aids):
            person, aid = link.person.detection, link.aid.detection
            a, b = person.xyxy, aid.xyxy
            color = (255, 220, 0)
            cv2.line(frame, tuple(map(int, person.center)), tuple(map(int, aid.center)), color, 2)
            x1, y1 = int(min(a[0], b[0])), int(min(a[1], b[1]))
            x2, y2 = int(max(a[2], b[2])), int(max(a[3], b[3]))
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(frame, link.label + " (spatial match)", (x1, max(18, y1-24)),
                        cv2.FONT_HERSHEY_SIMPLEX, .55, color, 2)
