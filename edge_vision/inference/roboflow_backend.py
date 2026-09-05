"""Hosted detection via Roboflow serverless inference.

**This backend uploads frames off the device, on the dispatch path.** That is a
stronger claim than the age overlay's: the age path requires ``--preview`` and
so can never run in a headless deployment, whereas detection runs headless in
production. Enabling this means a station node streams imagery of passengers to
a third party as its normal operating mode.

It is therefore opt-in (``--backend roboflow``), never the default, and warns on
construction naming the destination.

Failure semantics are deliberately loud. A detector that returns "nothing
detected" when the network is down is worse than one that stops: the gate would
see an empty scene, no boarding event would fire, and a wheelchair user would be
skipped with nothing in the logs to say why. So transient failures return no
detections but are counted and warned, and a sustained outage raises
`RoboflowUnavailable` so the operator finds out. Pair it with
``--fallback-weights`` to degrade to a local checkpoint instead of stopping.
"""

from __future__ import annotations

import os
import time
import warnings

import numpy as np

from .base import Detection, Detector
from .validation import ClassMapError

DEFAULT_API_URL = "https://serverless.roboflow.com"

#: Consecutive hosted failures tolerated before the pipeline gives up.
MAX_CONSECUTIVE_FAILURES = 15

#: Minimum seconds between hosted calls. Serverless inference is billed and
#: rate-limited; a 30fps camera would otherwise issue 30 requests a second.
MIN_REQUEST_INTERVAL_S = 0.20

JPEG_QUALITY = 85


class RoboflowUnavailable(RuntimeError):
    """The hosted detector failed persistently; dispatch cannot be trusted."""


class RoboflowConfigError(RuntimeError):
    """The hosted backend was requested but cannot be configured safely."""


class RoboflowDetector(Detector):
    """Detector backed by a hosted Roboflow model.

    `class_map` translates the hosted project's labels onto the deployment
    contract, exactly as the ONNX path does — a hosted wheelchair-only model has
    the same index-mismatch hazard as a downloaded one.
    """

    def __init__(
        self,
        model_id: str,
        class_names: list[str] | None = None,
        class_map: dict[str, str | None] | None = None,
        api_url: str = DEFAULT_API_URL,
        min_interval_s: float = MIN_REQUEST_INTERVAL_S,
    ) -> None:
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
        except ImportError as exc:  # pragma: no cover - optional dep
            raise RoboflowConfigError(
                "the roboflow backend needs the inference SDK:\n    pip install inference-sdk"
            ) from exc

        warnings.warn(
            f"HOSTED DETECTION ENABLED: every analysed frame is uploaded to {api_url} "
            f"for model {model_id}. This is the dispatch path, so it runs headless in "
            f"production. Passengers must be informed and the link becomes a dependency "
            f"of boarding alerts.",
            RuntimeWarning,
            stacklevel=2,
        )

        self.model_id = model_id
        self.class_names = list(class_names) if class_names else []
        # A hosted project's label set cannot be enumerated before the first
        # response, so only the map's targets can be checked up front. Unmapped
        # labels are caught per response in `_parse`.
        if class_map:
            bad = sorted(
                {t for t in class_map.values() if t is not None and t not in self.class_names}
            )
            if bad:
                raise ClassMapError(
                    f"class map targets {bad!r} are not in the contract {self.class_names!r}"
                )
        self._class_map = class_map
        self._min_interval = max(0.0, min_interval_s)
        self._last_call = 0.0
        self._failures = 0
        self._cached: list[Detection] = []
        self._client = InferenceHTTPClient(api_url=api_url, api_key=api_key).configure(
            InferenceConfiguration(api_key_transport="header")
        )

    # --- Detector contract -------------------------------------------------

    def infer(self, frame: np.ndarray, conf: float = 0.25) -> list[Detection]:
        now = time.monotonic()
        # Between calls, repeat the last answer rather than reporting an empty
        # scene: the gate counts consecutive agreeing frames, and interleaving
        # blanks would stop it ever reaching its threshold.
        if now - self._last_call < self._min_interval:
            return list(self._cached)
        self._last_call = now

        try:
            result = self._client.infer(frame, model_id=self.model_id)
        except Exception as exc:  # noqa: BLE001 - any transport failure
            self._failures += 1
            if self._failures in (1, 5) or self._failures % 10 == 0:
                warnings.warn(
                    f"hosted inference failed ({self._failures} consecutive): {exc}",
                    RuntimeWarning,
                    stacklevel=2,
                )
            if self._failures >= MAX_CONSECUTIVE_FAILURES:
                raise RoboflowUnavailable(
                    f"hosted detector unreachable after {self._failures} attempts; "
                    "dispatch would silently miss passengers. Use --backend onnx with "
                    "local weights, or fix connectivity."
                ) from exc
            self._cached = []
            return []

        self._failures = 0
        self._cached = self._parse(result, conf)
        return list(self._cached)

    def warmup(self, height: int = 480, width: int = 640) -> None:
        """No local graph to warm. Skipped so startup does not bill a request."""
        return None

    # --- response handling -------------------------------------------------

    def _parse(self, result: object, conf: float) -> list[Detection]:
        predictions = _extract_predictions(result)
        if not predictions:
            return []

        out: list[Detection] = []
        for pred in predictions:
            if pred["confidence"] < conf:
                continue
            label = pred["label"]
            if self._class_map is not None:
                if label not in self._class_map:
                    # Fail closed: a class the hosted project added must not
                    # reach dispatch under its own name. Unlike a local
                    # checkpoint the label set cannot be enumerated up front,
                    # so this is the first point it can be caught.
                    raise ClassMapError(
                        f"hosted model returned unmapped class {label!r}; add it to "
                        "checkpoint_class_map (or map it to null to discard)"
                    )
                label = self._class_map[label]
                if label is None:
                    continue  # deliberately discarded
            cid = self.class_names.index(label) if label in self.class_names else 0
            out.append(Detection(cid, label, pred["confidence"], pred["xyxy"]))
        return out


def _extract_predictions(result: object) -> list[dict]:
    """Normalise a Roboflow object-detection response.

    Roboflow returns centre-based boxes in pixels (``x``, ``y``, ``width``,
    ``height``); the Detector contract is corner-based ``xyxy``. Malformed
    entries are skipped rather than raising, so one odd row cannot stop dispatch.
    """
    if not isinstance(result, dict):
        return []
    raw = result.get("predictions")
    if not isinstance(raw, list):
        return []

    out: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        label = item.get("class") or item.get("label")
        confidence = item.get("confidence")
        x, y = item.get("x"), item.get("y")
        w, h = item.get("width"), item.get("height")
        if not isinstance(label, str) or not isinstance(confidence, (int, float)):
            continue
        if not all(isinstance(v, (int, float)) for v in (x, y, w, h)):
            continue
        out.append({
            "label": label,
            "confidence": float(confidence),
            "xyxy": (
                float(x) - float(w) / 2.0,
                float(y) - float(h) / 2.0,
                float(x) + float(w) / 2.0,
                float(y) + float(h) / 2.0,
            ),
        })
    return out
