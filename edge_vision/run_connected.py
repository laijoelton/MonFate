"""Connect the local real checkpoint to the dashboard's vision ingest.

Run from the repository root: python -m edge_vision.run_connected
Pass --source <video-or-camera> and optionally --max-frames N for a bounded run.
No images leave this machine; only debounced mobility events reach localhost.
"""
import argparse
import os
from pathlib import Path
import sys


def main():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default="0")
    parser.add_argument("--stop-id", default="stop_01")
    parser.add_argument("--max-frames", type=int, default=0)
    parser.add_argument("--weights", type=Path, default=root / "edge_vision/models/wheelchair_real.onnx")
    args = parser.parse_args()
    if not args.weights.is_file():
        parser.error("Real checkpoint missing; supply --weights (mock fallback is disabled)")
    if args.source == "mock":
        parser.error("Use a camera or video for connected model inference")
    sys.path.insert(0, str(root / "backend_api"))
    from app.config import get_settings
    from app.stops import STOP_NAMES
    if args.stop_id not in STOP_NAMES:
        parser.error("Choose a dashboard stop ID: " + ", ".join(STOP_NAMES))
    os.environ["SYS_STOP_ID"] = args.stop_id
    os.environ["SYS_API_KEY"] = get_settings().API_KEY
    print(f"Connecting local vision to {STOP_NAMES[args.stop_id]} at http://127.0.0.1:8000", flush=True)
    sys.argv = ["edge_vision.run", "--source", args.source, "--backend", "onnx",
                "--weights", str(args.weights.resolve()), "--config", str(root / "edge_vision/classes.yaml"),
                "--imgsz", "320", "--device", "cpu", "--no-fallback",
                "--emit", "http://127.0.0.1:8000", "--max-frames", str(args.max_frames)]
    from edge_vision.run import main as run
    run()


if __name__ == "__main__":
    main()
