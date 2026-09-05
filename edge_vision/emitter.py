"""Accessibility detection event emitter.

Sends a validated, **image-free** metadata record per accepted detection. No
frames ever leave the device. Fail-closed: an unknown class raises.

This privacy property is load-bearing for MonFate, not incidental: the subjects
are disabled and mobility-impaired passengers at public transit stops. The
station node reports "a wheelchair boarding request occurred at stop X at time
T" and nothing else — no frames, no faces, no re-identifiable attributes.

This guarantee covers the DISPATCH path in full: nothing this emitter sends,
under any configuration, contains imagery or an inferred personal attribute.

Two optional components sit outside it. Both are off by default, and neither
puts imagery or an inferred attribute into an event — but while either is
enabled the *device* is no longer image-free, even though the *events* still
are. Deployments needing the unqualified guarantee must leave both off.

* ``--age-backend roboflow`` uploads preview frames to a hosted age model
  (`roboflow_age.py`). It requires ``--preview``, so it cannot run headless.
* ``--backend roboflow`` uploads every analysed frame to a hosted *detector*
  (`inference/roboflow_backend.py`). This one is stronger: detection is the
  dispatch path, so it runs headless in production and makes boarding alerts
  depend on a network link. Prefer local weights where the choice exists.

Sinks:
  - stdout : one JSON line per event (default)
  - http   : POST to <base>/api/v1/vision/events  with X-API-Key
  - mqtt   : publish JSON to a topic (needs paho-mqtt)
"""

from __future__ import annotations

import json
import time
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from math import isfinite

SCHEMA_VERSION = 1


@dataclass(frozen=True)
class DetectionEvent:
    schema_version: int
    event_id: str
    device_id: str
    observed_at: str          # ISO-8601, timezone-aware (T0 wall clock)
    model_version: str
    label: str
    confidence: float | None
    object_count: int
    inference_ms: int
    bbox_xyxy: tuple[float, float, float, float] | None
    is_simulation: bool
    t_capture_ns: int | None = None   # T0: monotonic ns at frame capture
    t_infer_ns: int | None = None     # T1: monotonic ns after inference

    def __post_init__(self) -> None:
        if self.schema_version != SCHEMA_VERSION:
            raise ValueError("unsupported schema_version")
        for f in ("event_id", "device_id", "observed_at", "model_version", "label"):
            v = getattr(self, f)
            if not isinstance(v, str) or not v.strip():
                raise ValueError(f"{f} must be a non-empty string")
        try:
            ts = datetime.fromisoformat(self.observed_at.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("observed_at must be ISO-8601") from exc
        if ts.tzinfo is None or ts.utcoffset() is None:
            raise ValueError("observed_at must include a timezone")
        if self.confidence is not None and (
            isinstance(self.confidence, bool)
            or not isfinite(self.confidence)
            or not 0.0 <= self.confidence <= 1.0
        ):
            raise ValueError("confidence must be between 0 and 1")
        for f in ("object_count", "inference_ms"):
            v = getattr(self, f)
            if not isinstance(v, int) or v < 0:
                raise ValueError(f"{f} must be a non-negative integer")

    def to_json(self) -> str:
        return json.dumps(asdict(self), separators=(",", ":"), sort_keys=True)


class EventEmitter:
    def __init__(
        self,
        device_id: str,
        model_version: str,
        allowed_labels: set[str],
        sink: str = "stdout",
        http_base: str | None = None,
        api_key: str | None = None,
        mqtt_broker: str | None = None,
        mqtt_topic: str = "monfate/events",
        is_simulation: bool = False,
    ) -> None:
        self.device_id = device_id
        self.model_version = model_version
        self.allowed = frozenset(allowed_labels)
        self.sink = sink
        self.http_base = http_base.rstrip("/") if http_base else None
        self.api_key = api_key
        self.is_simulation = is_simulation
        self._mqtt = None
        if sink == "mqtt":
            import paho.mqtt.client as mqtt

            host, _, port = (mqtt_broker or "localhost").partition(":")
            self._mqtt = mqtt.Client()
            self._mqtt.connect(host, int(port or 1883), keepalive=60)
            self._mqtt.loop_start()
            self._mqtt_topic = mqtt_topic
        if sink == "http":
            import requests  # noqa: F401  (surface the dependency early)

    def emit(
        self,
        label: str,
        confidence: float | None,
        object_count: int,
        inference_ms: int,
        bbox_xyxy: tuple[float, float, float, float] | None = None,
        t_capture_ns: int | None = None,
        t_infer_ns: int | None = None,
    ) -> DetectionEvent:
        if label not in self.allowed:
            raise ValueError(f"label {label!r} not in allowed set; fail closed")

        # T0 wall clock: if the caller gave a monotonic capture stamp, back-date
        # observed_at by the elapsed time so the backend measures the true loop.
        observed = datetime.now(timezone.utc)
        if t_capture_ns is not None:
            observed = observed - timedelta(seconds=(time.monotonic_ns() - t_capture_ns) / 1e9)

        event = DetectionEvent(
            schema_version=SCHEMA_VERSION,
            event_id=str(uuid.uuid4()),
            device_id=self.device_id,
            observed_at=observed.isoformat(),
            model_version=self.model_version,
            label=label,
            confidence=confidence,
            object_count=int(object_count),
            inference_ms=int(inference_ms),
            bbox_xyxy=tuple(float(v) for v in bbox_xyxy) if bbox_xyxy else None,
            is_simulation=self.is_simulation,
            t_capture_ns=t_capture_ns,
            t_infer_ns=t_infer_ns,
        )
        self._deliver(event)
        return event

    def _deliver(self, event: DetectionEvent) -> None:
        payload = event.to_json()
        if self.sink == "stdout":
            print(payload, flush=True)
        elif self.sink == "http":
            import requests

            for attempt in range(3):
                try:
                    r = requests.post(
                        f"{self.http_base}/api/v1/vision/events",
                        data=payload,
                        headers={"Content-Type": "application/json", "X-API-Key": self.api_key or ""},
                        timeout=5,
                    )
                    if r.status_code < 400:
                        return
                    print(f"[emitter] backend rejected event ({r.status_code}): {r.text}")
                    return  # server-side rejection — retrying the same bytes won't help
                except requests.exceptions.RequestException as exc:
                    time.sleep(0.5 * (attempt + 1))
                    last = exc
            print(f"[emitter] could not reach backend after retries: {last}")
        elif self.sink == "mqtt":
            self._mqtt.publish(self._mqtt_topic, payload)
