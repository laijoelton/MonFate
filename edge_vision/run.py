"""Edge vision pipeline runner: source -> inference -> gate -> emitter -> (preview).

    python -m edge_vision.run --source 0 --weights edge_vision/models/example_yolo.pt --preview
    python -m edge_vision.run --source clip.mp4 --backend onnx --weights m.onnx \
           --emit http://localhost:8000 --api-key "$SYS_API_KEY"

Standalone / offline (no camera, no model, no deps beyond numpy+opencv):
    python -m edge_vision.run --mock
    python -m edge_vision.run --source loop:sample.mp4 --backend mock

Press Q or Esc in the preview window to quit.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

import numpy as np
import yaml

from .gate import ConsecutiveDetectionGate
from .emitter import EventEmitter
from .detector import MobilityDetector, DISPATCH_CLASSES
from .tracking import BoxSmoother, filter_detections


# --------------------------------------------------------------------------- #
# frame sources
# --------------------------------------------------------------------------- #
class MockCapture:
    """Synthetic 640x480 frames with a drifting rectangle — no camera needed."""

    def __init__(self) -> None:
        self._t = 0

    def read(self):
        import cv2

        self._t += 1
        frame = np.full((480, 640, 3), 32, dtype=np.uint8)
        x = int(220 + 120 * np.sin(self._t / 15))
        y = int(180 + 60 * np.cos(self._t / 20))
        cv2.rectangle(frame, (x, y), (x + 180, y + 120), (60, 160, 60), -1)
        return True, frame

    def release(self):
        pass


class LoopCapture:
    """Wrap a video file and seek back to frame 0 at EOF."""

    def __init__(self, path: str) -> None:
        import cv2

        self._cv2 = cv2
        self._cap = cv2.VideoCapture(path)
        if not self._cap.isOpened():
            raise RuntimeError(f"could not open {path!r}")

    def read(self):
        ok, frame = self._cap.read()
        if not ok:
            self._cap.set(self._cv2.CAP_PROP_POS_FRAMES, 0)
            ok, frame = self._cap.read()
        return ok, frame

    def release(self):
        self._cap.release()


def open_source(source: str):
    if source == "mock":
        return MockCapture()
    if source.startswith("loop:"):
        return LoopCapture(source[5:])
    import cv2

    cap = cv2.VideoCapture(int(source) if source.isdigit() else source)
    if not cap.isOpened():
        raise RuntimeError(f"could not open source {source!r}")
    return cap


# --------------------------------------------------------------------------- #
def load_config(path: Path) -> dict:
    if path.is_file():
        return yaml.safe_load(path.read_text())
    example = path.with_name("classes.example.yaml")
    print(f"[run] {path.name} not found, using {example.name}")
    return yaml.safe_load(example.read_text())


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--source", default=os.getenv("SYS_VISION_SOURCE", "0"),
                   help="webcam index | file | url | 'mock' | 'loop:<file>'")
    p.add_argument("--weights", default=os.getenv("SYS_VISION_MODEL", "edge_vision/models/mobility.onnx"))
    p.add_argument("--backend", default=os.getenv("SYS_VISION_BACKEND"),
                   choices=["pytorch", "onnx", "mock"])
    p.add_argument("--fallback", action="store_true", default=_env_bool("SYS_VISION_FALLBACK", True),
                   help="retry the same validated artifact on CPU (default on)")
    p.add_argument("--no-fallback", dest="fallback", action="store_false")
    p.add_argument("--mock", action="store_true", help="shortcut for --source mock --backend mock")
    p.add_argument("--config", default="edge_vision/classes.yaml", type=Path)
    p.add_argument("--imgsz", type=int, default=416)
    p.add_argument("--device", default=os.getenv("SYS_VISION_DEVICE", "auto"))
    p.add_argument("--preview", action="store_true")
    p.add_argument("--confidence", type=float, help="minimum detection confidence (config default 0.60)")
    p.add_argument("--smoothing-alpha", type=float, default=.35,
                   help="EMA new-box weight in (0,1]; lower gives steadier preview boxes")
    p.add_argument("--demographics", action="store_true",
                   help="local approximate age overlay only; requires --preview; never emitted")
    p.add_argument("--age-model-dir", type=Path,
                   default=Path(__file__).resolve().parent / "models" / "age_preview")
    p.add_argument("--max-frames", type=int, default=0, help="stop after N frames (0 = unlimited)")
    p.add_argument("--emit", metavar="HTTP_BASE", default=os.getenv("SYS_API_BASE_URL") or None)
    p.add_argument("--mqtt", metavar="HOST:PORT")
    p.add_argument("--api-key", default=os.getenv("SYS_API_KEY"))
    p.add_argument("--simulation", action="store_true", help="use mock inference and mark events simulated")
    args = p.parse_args()
    if args.demographics and not args.preview:
        p.error("--demographics requires --preview (local age overlay only)")
    if args.max_frames < 0:
        p.error("--max-frames must be non-negative")
    if not 0 < args.smoothing_alpha <= 1:
        p.error("--smoothing-alpha must be in (0, 1]")
    return args


def _env_bool(name: str, default: bool) -> bool:
    v = os.getenv(name)
    return default if v is None else v.strip().lower() in ("1", "true", "yes", "on")


def main() -> None:
    args = parse_args()
    if args.mock:
        args.source, args.backend, args.simulation = "mock", "mock", True
        if "--emit" not in sys.argv:   # don't assume a backend is up for a bare --mock
            args.emit = None

    cfg = load_config(args.config)
    names: list[str] = cfg["names"]
    accepted: set[str] = set(cfg.get("accepted", names))
    det_conf = args.confidence if args.confidence is not None else float(cfg.get("detection_confidence", .60))
    other_thr = float(cfg.get("other_threshold", 0.70))
    required = cfg.get("required_consecutive", 5)
    if type(required) is not int or required != 5:
        raise ValueError("mobility deployment requires exactly 5 consecutive frames")
    if accepted != DISPATCH_CLASSES:
        raise ValueError("accepted classes must be wheelchair, stroller, mobility_aid")
    if not (0 <= det_conf <= 1 and 0 <= other_thr <= 1):
        raise ValueError("confidence thresholds must each be between 0 and 1")

    detector = MobilityDetector(
        args.weights, backend=args.backend, class_names=names,
        imgsz=args.imgsz, device=args.device, fallback=args.fallback, simulation=args.simulation,
    )
    model_version = detector.model_version
    detector.warmup()
    gate = ConsecutiveDetectionGate(accepted, required)
    smoother = BoxSmoother(alpha=args.smoothing_alpha) if args.preview else None
    age_preview = None
    if args.demographics:
        from .age_preview import AgePreview
        age_preview = AgePreview(args.age_model_dir)

    sink = "http" if args.emit else "mqtt" if args.mqtt else "stdout"
    emitter = EventEmitter(
        device_id=os.getenv("SYS_STOP_ID", "stop_01"), model_version=model_version,
        allowed_labels=accepted, sink=sink, http_base=args.emit,
        api_key=args.api_key, mqtt_broker=args.mqtt, is_simulation=detector.is_simulation,
    )

    def resolve_label(name: str, conf: float) -> str:
        return "other" if name in accepted and conf < other_thr else name

    cap = open_source(args.source)
    processed = 0
    last_shape = None
    print(f"[run] source={args.source} backend={args.backend or 'auto'} sink={sink}. Ctrl-C to stop.")
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                if processed == 0:
                    raise RuntimeError(f"source {args.source!r} opened but returned no frames")
                break
            t_capture_ns = time.monotonic_ns()          # T0
            detections = filter_detections(detector.infer(frame, conf=det_conf), det_conf)
            t_infer_ns = time.monotonic_ns()            # T1
            infer_ms = int((t_infer_ns - t_capture_ns) / 1e6)

            labels = [resolve_label(d.class_name, d.confidence) for d in detections]
            single = labels[0] if len(labels) == 1 and labels[0] in accepted else None
            result = gate.observe(single)

            if result.emitted_acceptance:
                d = detections[0]
                emitter.emit(label=result.label, confidence=d.confidence,
                             object_count=len(detections), inference_ms=infer_ms, bbox_xyxy=d.xyxy,
                             t_capture_ns=t_capture_ns, t_infer_ns=t_infer_ns)

            if args.preview:
                import cv2

                if frame.shape != last_shape:
                    smoother.reset()
                    last_shape = frame.shape
                if age_preview is not None:
                    age_preview.render(frame)
                for track in smoother.update(detections):
                    d = track.detection
                    lab = resolve_label(d.class_name, d.confidence)
                    x1, y1, x2, y2 = (int(v) for v in d.xyxy)
                    color = (140, 140, 140) if track.missed else (0, 200, 0) if lab != "other" else (0, 165, 255)
                    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                    suffix = " (held)" if track.missed else ""
                    cv2.putText(frame, f"{lab.upper()} {d.confidence:.0%}{suffix}", (x1, max(y1 - 8, 20)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
                cv2.putText(frame, f"{result.status.upper()} {result.label or ''} "
                            f"{result.consecutive}/{required}", (16, 32),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 0), 2)
                cv2.imshow("edge_vision", frame)
                if cv2.waitKey(1) & 0xFF in (ord("q"), 27):
                    break
            elif args.source == "mock":
                time.sleep(0.02)  # ~50 fps ceiling; don't spin the CPU headless
            processed += 1
            if args.max_frames and processed >= args.max_frames:
                break
    except KeyboardInterrupt:
        pass
    finally:
        cap.release()
        try:
            import cv2

            cv2.destroyAllWindows()
        except Exception:
            pass


if __name__ == "__main__":
    main()
