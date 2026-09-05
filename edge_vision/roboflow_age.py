"""Hosted age-bracket overlay via Roboflow serverless inference.

**This backend uploads frames off the device.** It is the one component in the
pipeline that does, and it exists only because the operator explicitly asked for
hosted age inference. Everything about it is therefore opt-in and loud:

* Selected only by ``--age-backend roboflow``; the default stays local.
* Inherits ``--demographics requires --preview``, so it can never run in a
  headless dispatch deployment.
* Prints a warning naming the destination host on every start.

Invariants preserved from the local overlay (`age_preview.AgePreview`):

* **Age never reaches an event.** The emitter's schema has no age field and this
  module never touches the emitter, the gate, or any network sink but Roboflow.
  Age is drawn on the local preview window and discarded with the frame.
* **Nothing is written to disk.** Frames are JPEG-encoded in memory and the
  buffer is dropped after the request.
* **Requests are throttled**, because every call is both a cost and a face
  leaving the building.

The API key is read from ``ROBOFLOW_API_KEY``. It is deliberately not accepted
as a CLI argument: keys passed on a command line end up in shell history, `ps`
output, and CI logs.
"""

from __future__ import annotations

import os
import warnings
from dataclasses import dataclass, field

import numpy as np

DEFAULT_MODEL_ID = "age-detection-bbbyp/1"
DEFAULT_API_URL = "https://serverless.roboflow.com"

#: Frames between hosted calls. Much higher than the local overlay's interval:
#: each request is a network round-trip, a billable inference, and a face
#: transmitted to a third party.
DEFAULT_INTERVAL = 30

#: JPEG quality for the uploaded frame. Low enough to keep requests small,
#: high enough for a face model to be meaningful.
JPEG_QUALITY = 80


class RoboflowConfigError(RuntimeError):
    """The hosted backend was requested but cannot be configured safely."""


@dataclass
class _Cached:
    label: str
    confidence: float
    frame_seen: int


@dataclass
class RoboflowAgePreview:
    """Draws an age bracket on the preview using hosted inference.

    Mirrors `age_preview.AgePreview.render(frame) -> None` so `run.py` can treat
    the two interchangeably.
    """

    model_id: str = DEFAULT_MODEL_ID
    api_url: str = DEFAULT_API_URL
    interval: int = DEFAULT_INTERVAL
    _client: object | None = field(default=None, init=False, repr=False)
    _frame: int = field(default=0, init=False, repr=False)
    _cached: _Cached | None = field(default=None, init=False, repr=False)
    _failures: int = field(default=0, init=False, repr=False)

    def __post_init__(self) -> None:
        if self.interval < 1:
            raise ValueError("interval must be positive")

        api_key = os.getenv("ROBOFLOW_API_KEY", "").strip()
        if not api_key:
            raise RoboflowConfigError(
                "ROBOFLOW_API_KEY is not set. Put it in a gitignored .env or export it:\n"
                "    export ROBOFLOW_API_KEY=...        # macOS/Linux\n"
                '    $env:ROBOFLOW_API_KEY="..."        # PowerShell\n'
                "Never pass the key as a command-line argument or commit it."
            )

        try:
            from inference_sdk import InferenceConfiguration, InferenceHTTPClient
        except ImportError as exc:  # pragma: no cover - depends on optional dep
            raise RoboflowConfigError(
                "the roboflow age backend needs the inference SDK:\n"
                "    pip install inference-sdk"
            ) from exc

        warnings.warn(
            f"HOSTED AGE INFERENCE ENABLED: frames containing faces will be uploaded to "
            f"{self.api_url} for model {self.model_id}. This is the only part of the "
            f"pipeline that sends imagery off the device. Ensure passengers are informed "
            f"and that this is lawful for your deployment.",
            RuntimeWarning,
            stacklevel=2,
        )

        self._client = InferenceHTTPClient(
            api_url=self.api_url, api_key=api_key
        ).configure(InferenceConfiguration(api_key_transport="header"))

    # --- rendering --------------------------------------------------------

    def render(self, frame: np.ndarray) -> None:
        """Overlay the most recent age bracket. Never raises into the loop."""
        import cv2

        self._frame += 1
        if self._frame % self.interval == 0:
            self._refresh(frame)

        if self._cached is None:
            return
        label = f"~{self._cached.label} ({self._cached.confidence:.0%}) [hosted]"
        cv2.putText(frame, label, (16, 96), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                    (0, 200, 255), 2)

    def _refresh(self, frame: np.ndarray) -> None:
        import cv2

        ok, buffer = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])
        if not ok:
            return

        try:
            # The SDK accepts a numpy array or a path; passing the in-memory
            # array avoids ever writing a face to disk.
            result = self._client.infer(frame, model_id=self.model_id)
        except Exception as exc:  # noqa: BLE001 - a preview overlay must never
            # kill the dispatch loop. A hosted dependency is exactly the thing
            # that goes down mid-demo, and the accessibility pipeline has to
            # keep running without it.
            self._failures += 1
            if self._failures in (1, 10, 100):
                warnings.warn(
                    f"hosted age inference failed ({self._failures}x), overlay paused: {exc}",
                    RuntimeWarning,
                    stacklevel=2,
                )
            return
        finally:
            del buffer

        parsed = parse_age_response(result)
        if parsed is not None:
            label, confidence = parsed
            self._cached = _Cached(label, confidence, self._frame)


def parse_age_response(result: object) -> tuple[str, float] | None:
    """Pull the top age bracket out of a Roboflow response.

    Tolerates both the classification shape (``predictions`` as a list of
    ``{class, confidence}``) and the dict-keyed shape some project types return,
    because the exact layout depends on how the project was configured and
    guessing wrong should degrade the overlay, not crash the pipeline.
    """
    if not isinstance(result, dict):
        return None
    predictions = result.get("predictions")

    if isinstance(predictions, dict):
        best_label, best_conf = None, -1.0
        for label, payload in predictions.items():
            conf = payload.get("confidence") if isinstance(payload, dict) else None
            if isinstance(conf, (int, float)) and conf > best_conf:
                best_label, best_conf = str(label), float(conf)
        return (best_label, best_conf) if best_label is not None else None

    if isinstance(predictions, list):
        best_label, best_conf = None, -1.0
        for item in predictions:
            if not isinstance(item, dict):
                continue
            label = item.get("class") or item.get("label")
            conf = item.get("confidence")
            if label and isinstance(conf, (int, float)) and conf > best_conf:
                best_label, best_conf = str(label), float(conf)
        return (best_label, best_conf) if best_label is not None else None

    return None
