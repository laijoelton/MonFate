"""WebSocket fan-out with bounded per-client buffers.

Every ingested vehicle update / detection / alert is offered to each connected
client. A slow client cannot grow memory without limit: each connection has its
own `deque(maxlen=STREAM_CLIENT_BUFFER)` and a dedicated drain task. When the
buffer is full the OLDEST queued message is dropped — a cockpit that has fallen
behind wants the freshest positions, not a backlog — and a `lag` frame is sent
so the UI can show it dropped frames rather than silently lying.

Pure asyncio; no DB, no network client.
"""

from __future__ import annotations

import asyncio
import json
import time
from collections import deque

from fastapi import WebSocket

from .config import get_settings

_BUF = get_settings().STREAM_CLIENT_BUFFER


class LatencyTracker:
    """Rolling window of edge -> cloud delivery timings for the telemetry strip."""

    def __init__(self, window: int = 120) -> None:
        self._e2e: deque[float] = deque(maxlen=window)
        self._infer: deque[float] = deque(maxlen=window)
        self.last: dict = {}
        self.last_seen = 0.0

    def record_event(self, *, observed_at: float, inference_ms: float, ingested_at: float) -> dict:
        loop_ms = max(0.0, (ingested_at - observed_at) * 1000.0)
        self._e2e.append(loop_ms)
        self._infer.append(inference_ms)
        self.last = {
            "e2e_ms": round(loop_ms, 2),
            "infer_ms": round(inference_ms, 2),
            "transit_ms": round(max(0.0, loop_ms - inference_ms), 2),
        }
        self.last_seen = time.time()
        return self.last

    def snapshot(self) -> dict:
        def _p(d: deque, q: float) -> float | None:
            if not d:
                return None
            xs = sorted(d)
            return round(xs[min(len(xs) - 1, int(q * len(xs)))], 2)

        return {
            "e2e_ms_p50": _p(self._e2e, 0.5),
            "e2e_ms_p95": _p(self._e2e, 0.95),
            "infer_ms_p50": _p(self._infer, 0.5),
            "samples": len(self._e2e),
            "last": self.last,
        }


latency = LatencyTracker()


class _Client:
    __slots__ = ("ws", "buf", "event", "dropped", "task")

    def __init__(self, ws: WebSocket) -> None:
        self.ws = ws
        self.buf: deque[str] = deque(maxlen=_BUF)
        self.event = asyncio.Event()
        self.dropped = 0
        self.task: asyncio.Task | None = None

    def offer(self, message: str) -> None:
        if len(self.buf) == self.buf.maxlen:
            self.dropped += 1  # deque.append will evict the oldest
        self.buf.append(message)
        self.event.set()

    async def pump(self) -> None:
        try:
            while True:
                if not self.buf:
                    self.event.clear()
                    await self.event.wait()
                    continue
                msg = self.buf.popleft()
                await self.ws.send_text(msg)
                if self.dropped:
                    await self.ws.send_text(json.dumps({"kind": "lag", "dropped": self.dropped}))
                    self.dropped = 0
        except Exception:
            return  # client gone; StreamHub.disconnect cleans up


class StreamHub:
    def __init__(self) -> None:
        self._clients: set[_Client] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> _Client:
        await ws.accept()
        client = _Client(ws)
        client.task = asyncio.create_task(client.pump())
        async with self._lock:
            self._clients.add(client)
        return client

    async def disconnect(self, client: _Client) -> None:
        async with self._lock:
            self._clients.discard(client)
        if client.task:
            client.task.cancel()

    async def broadcast(self, kind: str, payload: dict) -> None:
        message = json.dumps({"kind": kind, "data": payload}, default=str)
        async with self._lock:
            clients = list(self._clients)
        for client in clients:
            client.offer(message)

    @property
    def client_count(self) -> int:
        return len(self._clients)


hub = StreamHub()
