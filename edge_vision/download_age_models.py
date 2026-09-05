"""Explicit one-time download of face and age-only OpenCV preview models."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import urllib.request

DEFAULT_MODEL_DIR = Path(__file__).resolve().parent / "models" / "age_preview"
MODEL_URLS = {
    "opencv_face_detector.pbtxt": "https://raw.githubusercontent.com/spmallick/learnopencv/master/AgeGender/opencv_face_detector.pbtxt",
    "opencv_face_detector_uint8.pb": "https://raw.githubusercontent.com/spmallick/learnopencv/master/AgeGender/opencv_face_detector_uint8.pb",
    "age_deploy.prototxt": "https://raw.githubusercontent.com/spmallick/learnopencv/master/AgeGender/age_deploy.prototxt",
    "age_net.caffemodel": "https://raw.githubusercontent.com/eveningglow/age-and-gender-classification/5b60d9f8a8608cdbbcdaaa39bf28f351e8d8553b/model/age_net.caffemodel",
}
MODEL_SHA256 = {
    "opencv_face_detector.pbtxt": "5397808362fc6fb7c4044484848e297b22449d913a267fa7f8bd9d86dce29144",
    "opencv_face_detector_uint8.pb": "5c71d752ef2cbf2f457ac82fdd580fcb2522fd04c5efdaed18eb6d9e2843fbed",
    "age_deploy.prototxt": "f58b73e2e20766f54c583cb1a9404f45dab8901773da6864d94b63212ed37ca0",
    "age_net.caffemodel": "6dde5d07df5ca1d66ff39e525693f05ccfb9d2c437e188fdd1a10d42e57fabd6",
}


def download(destination: Path = DEFAULT_MODEL_DIR) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for name, url in MODEL_URLS.items():
        target = destination / name
        if not target.is_file():
            with urllib.request.urlopen(url, timeout=60) as response:
                data = response.read()
            if hashlib.sha256(data).hexdigest() != MODEL_SHA256[name]:
                raise ValueError(f"model checksum mismatch: {name}")
            temporary = target.with_suffix(target.suffix + ".part")
            temporary.write_bytes(data)
            temporary.replace(target)
        data = target.read_bytes()
        if hashlib.sha256(data).hexdigest() != MODEL_SHA256[name]:
            raise ValueError(f"model checksum mismatch: {name}")
        manifest[name] = {"url": url, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
        print(name, len(data), manifest[name]["sha256"])
    (destination / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", type=Path, default=DEFAULT_MODEL_DIR)
    download(parser.parse_args().model_dir)
